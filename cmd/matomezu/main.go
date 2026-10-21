// matomezu の CLI。常駐（serve）を立てる・止める入口。
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/alecthomas/kong"
	"github.com/umaxyon/matomezu/internal/browser"
	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/home"
	"github.com/umaxyon/matomezu/internal/mcp"
	"github.com/umaxyon/matomezu/internal/server"
	"github.com/umaxyon/matomezu/internal/storage"
	"github.com/umaxyon/matomezu/web"
)

var version = "dev"

// DefaultAddr は常駐が待つ場所。画面の設定のうちブラウザに残すもの（localStorage）はアドレスごとに分かれるので、ポートは毎回同じにする
const DefaultAddr = "127.0.0.1:7230"

// 裏で立てた常駐が待ち受けを始めるまで待つ時間
const startWait = 10 * time.Second

type cli struct {
	Serve   serveCmd   `cmd:"" help:"Run the server in the foreground."`
	Start   startCmd   `cmd:"" help:"Start the server in the background unless it is running, and print its URL."`
	Stop    stopCmd    `cmd:"" help:"Stop the background server."`
	MCP     mcpCmd     `cmd:"" name:"mcp" help:"Serve the MCP tools for an AI on stdin and stdout (starts the server unless it is running)."`
	Version versionCmd `cmd:"" help:"Print the version."`
}

// 常駐の立て方（serve と start で共通）
type serverFlags struct {
	Addr string `default:"${addr}" help:"Address to listen on (127.0.0.1 only)."`
	Web  string `help:"Serve the screen from this folder instead of the one built in." type:"existingdir"`
}

func (f serverFlags) args() []string {
	a := []string{"--addr", f.Addr}
	if f.Web != "" {
		a = append(a, "--web", f.Web)
	}
	return a
}

type serveCmd struct {
	serverFlags
}

type startCmd struct {
	serverFlags
}

type stopCmd struct{}

type mcpCmd struct {
	serverFlags
}

type versionCmd struct{}

func main() {
	ctx := kong.Parse(&cli{}, kong.Name("matomezu"), kong.Description("Diagrams you and your AI read and edit together."), kong.Vars{"addr": DefaultAddr})
	if err := ctx.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func openHome() (*home.Home, error) {
	dir, err := home.Dir()
	if err != nil {
		return nil, err
	}
	return home.Open(dir)
}

func (c *serveCmd) Run() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	lock, err := h.Lock()
	if err != nil {
		return err
	}
	defer lock.Unlock()

	webFS, err := screen(c.Web)
	if err != nil {
		return err
	}
	store, err := storage.OpenSQLite(h.DataPath())
	if err != nil {
		return err
	}
	defer store.Close()
	eng, err := engine.New()
	if err != nil {
		return err
	}
	hub, err := server.NewHub(store, eng)
	if err != nil {
		return err
	}
	host, _, err := net.SplitHostPort(c.Addr)
	if err != nil {
		return err
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("--addr must be on 127.0.0.1: %s", c.Addr)
	}
	ln, err := net.Listen("tcp", c.Addr)
	if err != nil {
		return err
	}
	token, err := home.NewToken()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	url := "http://" + ln.Addr().String() + "/"
	srv := &http.Server{
		Handler: server.Handler(server.Options{
			Web: webFS, Token: token, Version: version, Stop: stop, Hub: hub,
			URL: url, Open: func() error { return browser.Open(url) },
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}
	srv.RegisterOnShutdown(hub.CloseAll)
	if err := h.WriteServer(home.Server{URL: url, Token: token, PID: os.Getpid(), Version: version}); err != nil {
		return err
	}
	defer h.RemoveServer()
	fmt.Println(url)

	done := make(chan error, 1)
	go func() { done <- srv.Serve(ln) }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
	}
	shut, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(shut)
}

// screen は配る画面。--web があればそのフォルダ、無ければ埋め込んだもの
func screen(dir string) (fs.FS, error) {
	if dir != "" {
		return os.DirFS(dir), nil
	}
	if f, ok := web.Embedded(); ok {
		return f, nil
	}
	return nil, errors.New("this build has no screen built in: pass --web <folder>")
}

func (c *startCmd) Run() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := ensure(h, c.serverFlags)
	if err != nil {
		return err
	}
	fmt.Println(s.URL)
	return nil
}

func (c *mcpCmd) Run() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := ensure(h, c.serverFlags)
	if err != nil {
		return err
	}
	return mcp.Serve(os.Stdin, os.Stdout, httpAPI{s}, version)
}

// ensure は、立っている常駐のつなぎ方を返す。立っていなければ f で裏に立て、答えるまで待つ
func ensure(h *home.Home, f serverFlags) (*home.Server, error) {
	if s, err := running(h); err != nil || s != nil {
		return s, err
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	log, err := os.OpenFile(h.LogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, err
	}
	defer log.Close()
	cmd := exec.Command(exe, append([]string{"serve"}, f.args()...)...)
	cmd.Stdout, cmd.Stderr = log, log
	cmd.SysProcAttr = detached()
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()

	deadline := time.After(startWait)
	for {
		select {
		case <-exited:
			return nil, fmt.Errorf("the server stopped while starting: see %s", h.LogPath())
		case <-deadline:
			return nil, fmt.Errorf("the server did not start in %s: see %s", startWait, h.LogPath())
		case <-time.After(100 * time.Millisecond):
		}
		if s, _ := running(h); s != nil {
			return s, nil
		}
	}
}

// httpAPI は、合言葉を付けて常駐の AI の入口を呼ぶ
type httpAPI struct {
	s *home.Server
}

func (a httpAPI) Get(path string) (json.RawMessage, error) {
	return a.do(http.MethodGet, path, nil)
}

func (a httpAPI) Post(path string, body any) (json.RawMessage, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return a.do(http.MethodPost, path, b)
}

func (a httpAPI) do(method, path string, body []byte) (json.RawMessage, error) {
	req, err := http.NewRequest(method, a.s.URL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+a.s.Token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("the matomezu server did not answer: %w", err)
	}
	defer res.Body.Close()
	out, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s %s: %s %s", method, path, res.Status, bytes.TrimSpace(out))
	}
	return out, nil
}

// running は、立っていて答える常駐のつなぎ方。立っていなければ nil
func running(h *home.Home) (*home.Server, error) {
	up, err := h.Running()
	if err != nil || !up {
		return nil, err
	}
	s, err := h.ReadServer()
	if err != nil || s == nil {
		return nil, err
	}
	if _, err := call(s, http.MethodGet, "api/ping"); err != nil {
		return nil, nil
	}
	return s, nil
}

func (c *stopCmd) Run() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := running(h)
	if err != nil || s == nil {
		return err
	}
	if _, err := call(s, http.MethodPost, "api/stop"); err != nil {
		return err
	}
	for range 50 {
		if up, err := h.Running(); err != nil || !up {
			return err
		}
		time.Sleep(100 * time.Millisecond)
	}
	return errors.New("the server did not stop")
}

func (versionCmd) Run() error {
	fmt.Println(version)
	return nil
}

// call は合言葉を付けて常駐の API を呼ぶ
func call(s *home.Server, method, path string) (*http.Response, error) {
	req, err := http.NewRequest(method, s.URL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.Token)
	res, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s %s: %s", method, path, res.Status)
	}
	return res, nil
}
