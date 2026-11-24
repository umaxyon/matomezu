package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/umaxyon/matomezu/internal/browser"
	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/home"
	"github.com/umaxyon/matomezu/internal/server"
	"github.com/umaxyon/matomezu/internal/storage"
	"github.com/umaxyon/matomezu/web"
)

// 裏で立てた常駐が待ち受けを始めるまで待つ時間
const startWait = 10 * time.Second

// 常駐の立て方（serve と start で共通）
type serverFlags struct {
	Port   *int     `help:"Port to listen on at 127.0.0.1. The vault keeps it for the next start (0 picks a free port and is not kept). Without it: the kept port, else 7230 (5300 for a development vault)."`
	Web    string   `help:"Serve the screen from this folder instead of the one built in." type:"existingdir"`
	Plugin []string `help:"Add the plugin in this developer project folder (with matomezu.json). Repeat for more." type:"existingdir"`
}

func (f serverFlags) args() []string {
	var a []string
	if f.Port != nil {
		a = append(a, "--port", strconv.Itoa(*f.Port))
	}
	if f.Web != "" {
		a = append(a, "--web", f.Web)
	}
	for _, p := range f.Plugin {
		a = append(a, "--plugin", p)
	}
	return a
}

type serveCmd struct {
	serverFlags
}

type startCmd struct {
	serverFlags
	Open bool `help:"Open the screen and give the browser a screen cookie."`
}

type stopCmd struct{}

type openCmd struct{}

func openHome() (*home.Home, error) {
	dir, err := home.Dir()
	if err != nil {
		return nil, err
	}
	return home.Open(dir)
}

func (c *serveCmd) Run() error {
	c.serverFlags = devHere(c.serverFlags)
	h, err := openHome()
	if err != nil {
		return err
	}
	lock, err := h.Lock()
	if err != nil {
		return err
	}
	defer lock.Unlock()
	// 鍵を取ってから見る（matomezu use は鍵を持って counterpart.json を書く）
	if u, err := h.ReadCounterpart(); err != nil {
		return err
	} else if u != nil {
		return fmt.Errorf("this vault uses the server of %s: run matomezu use local first to run one here", counterpartName(*u))
	}
	go pruneBins()

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
	hub.SetBuild(server.Build{Version: version, DataVersion: storage.DataVersion()})
	hub.SetCommand(typedName("matomezu"))
	// 新しい版を、立ったときと 1 日ごとに確かめる（利用者の設定が許せば。開発の版は確かめない）
	if version == devVersion {
		hub.SetUpdateCheck(version, nil)
	} else {
		hub.SetUpdateCheck(version, latestFor(version))
		go func() {
			hub.CheckUpdateIfOn(context.Background())
			for range time.Tick(updateCheckEvery) {
				hub.CheckUpdateIfOn(context.Background())
			}
		}()
	}
	// 期限の過ぎたアノテーションを、時間で消す
	go func() {
		for now := range time.Tick(server.ExpireEvery) {
			if err := hub.Expire(now); err != nil {
				fmt.Fprintln(os.Stderr, "expire:", err)
			}
		}
	}()
	// 呼ばれないビジターを時間で退室させ、セッションが終わった要求を消す
	go func() {
		for now := range time.Tick(server.ParticipantSweepEvery) {
			if err := hub.SweepParticipants(now); err != nil {
				fmt.Fprintln(os.Stderr, "participants:", err)
			}
		}
	}()
	// 変換できないか台帳アセンブルで食い違う追加プラグインは外して立て、理由をログに残す（ほかのブックまで開けなくしない）
	for _, dir := range c.Plugin {
		if _, err := hub.LinkPlugin(dir); err != nil {
			fmt.Fprintf(os.Stderr, "plugin %s is not added: %v\n", dir, err)
		}
	}
	if err := setHost(hub, h); err != nil {
		return err
	}
	defer hub.CloseHostEntrance()
	port, err := listenPort(h, c.Port)
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	if errors.Is(err, errAddrInUse) {
		return fmt.Errorf("port %d is in use (by another program or the server of another vault): choose another with --port", port)
	}
	if err != nil {
		return err
	}
	if err := keepPort(h, c.Port); err != nil {
		return err
	}
	token, err := home.NewToken()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	url := "http://" + ln.Addr().String() + "/"
	keys, err := h.ReadCookieKeys()
	if err != nil {
		return err
	}
	cookieKeys := make([]server.CookieKey, len(keys))
	for i, k := range keys {
		cookieKeys[i] = server.CookieKey(k)
	}
	saveCookieKeys := func(ks []server.CookieKey) error {
		out := make([]home.CookieKey, len(ks))
		for i, k := range ks {
			out[i] = home.CookieKey(k)
		}
		return h.WriteCookieKeys(out)
	}
	srv := &http.Server{
		Handler: server.Handler(server.Options{
			Web: webFS, Token: token, Version: version, Stop: stop, Hub: hub,
			URL: url, Open: browser.Open, Cookies: server.NewScreenCookies(cookieKeys, saveCookieKeys),
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
	f := devHere(c.serverFlags)
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := ensure(h, f)
	if err != nil {
		return err
	}
	fmt.Println(s.URL)
	fmt.Fprintln(os.Stderr, "vault:", residentDir(h))
	if c.Open {
		return openBrowser(s)
	}
	// 画面 cookie の無いブラウザは、この URL を開いても断られる（URL は標準出力のまま、案内は標準エラーへ）
	fmt.Fprintln(os.Stderr, "Run matomezu open to give your browser access to the screen.")
	return nil
}

// ensure は、立っている常駐のつなぎ方を返す。立っていなければ f で裏に立て、答えるまで待つ。
// f がポートを選んでいて、立っている常駐が別のポートで待っていれば断る（止めて立て直すと、開いている画面と AI のつながりが切れる）。
// 保管庫が相手の常駐を使うと覚えていれば、その常駐（ensureCounterpart。ポートの決まりは同じで、ほかの f は立てるときだけ使うので見ない）
func ensure(h *home.Home, f serverFlags) (*home.Server, error) {
	if u, err := h.ReadCounterpart(); err != nil {
		return nil, err
	} else if u != nil {
		s, err := ensureCounterpart(u)
		if err == nil && f.Port != nil && *f.Port != 0 && serverPort(s) != *f.Port {
			return nil, fmt.Errorf("the server of %s is running at %s: stop it first (matomezu stop) to use port %d", u.Vault, s.URL, *f.Port)
		}
		return s, err
	}
	if s, err := localRunning(h); err == nil && s != nil && olderServer(s.Version) {
		// 今入っている版より古い常駐は、止めて今の版で立て直す（古くする向きには入れ替えない）
		if err := stopLocal(h, s); err != nil {
			return nil, err
		}
	} else if err != nil || s != nil {
		if err == nil && f.Port != nil && *f.Port != 0 && serverPort(s) != *f.Port {
			return nil, fmt.Errorf("the server of %s is running at %s: stop it first (matomezu stop) to use port %d", h.Dir, s.URL, *f.Port)
		}
		return s, err
	}
	exe, err := serveExe()
	if err != nil {
		return nil, err
	}
	log, err := os.OpenFile(h.LogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, err
	}
	defer log.Close()
	info, err := log.Stat()
	if err != nil {
		return nil, err
	}
	from := info.Size()
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
			// 同時に起動した別のプロセスの常駐が先に立っていれば、それを使う
			if s, _ := localRunning(h); s != nil {
				return s, nil
			}
			if why := lastLogLine(h.LogPath(), from); why != "" {
				return nil, fmt.Errorf("the server stopped while starting: %s (log: %s)", why, h.LogPath())
			}
			return nil, fmt.Errorf("the server stopped while starting: see %s", h.LogPath())
		case <-deadline:
			return nil, fmt.Errorf("the server did not start in %s: see %s", startWait, h.LogPath())
		case <-time.After(100 * time.Millisecond):
		}
		if s, _ := localRunning(h); s != nil {
			return s, nil
		}
	}
}

// serveExe は、常駐を立てる実行ファイル: 配る版は、npm の入口が書いた今入っている版の印の物（古い版の会話が立て直しても、新しい版で立つ）。
// 印が無い・その物が無い・開発の版は、自分
func serveExe() (string, error) {
	if exe, _, ok := installed(); ok {
		return exe, nil
	}
	return os.Executable()
}

// installedVersion は、今入っている版: 配る版は npm の入口が書いた印の版（その実行ファイルがあるとき）、無ければ自分
func installedVersion() string {
	if _, v, ok := installed(); ok {
		return v
	}
	return version
}

// installed は、配る版のとき、npm の入口が書いた印の実行ファイルと版（その実行ファイルがあるときだけ ok）
func installed() (exe, v string, ok bool) {
	if version == devVersion {
		return "", "", false
	}
	dir, err := home.BinDir()
	if err != nil {
		return "", "", false
	}
	in, _ := home.ReadInstalled(dir)
	if in == nil {
		return "", "", false
	}
	if _, err := os.Stat(in.Exe); err != nil {
		return "", "", false
	}
	return in.Exe, in.Version, true
}

// olderServer は、立っている常駐の版 running が、今入っている版より古いか（開発の版どうしは比べない）
func olderServer(running string) bool {
	now := installedVersion()
	if now == devVersion || running == devVersion {
		return false
	}
	return versionLess(running, now)
}

// pruneBins は、配る版の常駐が立つときに、写した実行ファイルの古い版を消す（今入っている版・自分の版と、それ以外で一番新しく写した版は残す）
func pruneBins() {
	if version == devVersion {
		return
	}
	dir, err := home.BinDir()
	if err != nil {
		return
	}
	keep := []string{version}
	if in, _ := home.ReadInstalled(dir); in != nil {
		keep = append(keep, in.Version)
	}
	home.PruneBins(dir, keep...)
}

// listenPort は、常駐が待つポート: 選んだ物 chosen（nil は選んでいない）、無ければ保管庫が覚えた物、無ければ既定（開発の保管庫 .dev-home は devPort、ほかは DefaultPort）
func listenPort(h *home.Home, chosen *int) (int, error) {
	if chosen != nil {
		return *chosen, nil
	}
	kept, err := h.ReadPort()
	if err != nil || kept != 0 {
		return kept, err
	}
	if filepath.Base(h.Dir) == devHomeDir {
		return devPort, nil
	}
	return DefaultPort, nil
}

// keepPort は、待ち受けを始めた常駐のポートを、利用者が選んだ物 chosen なら保管庫に覚える（選んでいない・0 は覚えない）
func keepPort(h *home.Home, chosen *int) error {
	if chosen == nil || *chosen == 0 {
		return nil
	}
	return h.WritePort(*chosen)
}

// serverPort は、立っている常駐 s が待つポート（読めなければ 0）
func serverPort(s *home.Server) int {
	u, err := url.Parse(s.URL)
	if err != nil {
		return 0
	}
	port, _ := strconv.Atoi(u.Port())
	return port
}

// lastLogLine は、ファイル path の from バイト目より後ろに書かれた、空でない最後の行（頭の「error: 」は外す。読めなければ空）
func lastLogLine(path string, from int64) string {
	b, err := os.ReadFile(path)
	if err != nil || int64(len(b)) < from {
		return ""
	}
	lines := strings.Split(strings.TrimSpace(string(b[from:])), "\n")
	return strings.TrimPrefix(strings.TrimSpace(lines[len(lines)-1]), "error: ")
}

// running は、立っていて答える常駐のつなぎ方。立っていなければ nil。保管庫が相手の常駐を使うと覚えていれば、その常駐
func running(h *home.Home) (*home.Server, error) {
	if u, err := h.ReadCounterpart(); err != nil {
		return nil, err
	} else if u != nil {
		return counterpartRunning(u)
	}
	return localRunning(h)
}

// residentDir は、保管庫 h が使う常駐の保管庫フォルダ（相手の常駐を使うと覚えていれば、その保管庫の、ここから見た場所）
func residentDir(h *home.Home) string {
	if u, _ := h.ReadCounterpart(); u != nil {
		return u.Vault
	}
	return h.Dir
}

// localRunning は、この保管庫の常駐が立っていて答えるなら、そのつなぎ方（鍵を持つ常駐の server.json）
func localRunning(h *home.Home) (*home.Server, error) {
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
	useDevHere()
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := running(h)
	if err != nil {
		return err
	}
	if s == nil {
		fmt.Fprintln(os.Stderr, "no server is running for", residentDir(h))
		return nil
	}
	fmt.Fprintln(os.Stderr, "stopping the server of", residentDir(h))
	return stopServer(h, s)
}

// stopServer は、保管庫 h が使う立っている常駐 s を止め、止まるまで待つ（相手の常駐を使うと覚えていれば、答えなくなるまで）
func stopServer(h *home.Home, s *home.Server) error {
	u, err := h.ReadCounterpart()
	if err != nil {
		return err
	}
	if u == nil {
		return stopLocal(h, s)
	}
	if _, err := call(s, http.MethodPost, "api/stop"); err != nil {
		return err
	}
	for range 50 {
		if up, err := counterpartRunning(u); err != nil || up == nil {
			return err
		}
		time.Sleep(100 * time.Millisecond)
	}
	return errors.New("the server did not stop")
}

// stopLocal は、この保管庫の立っている常駐 s を止め、鍵が空くまで待つ
func stopLocal(h *home.Home, s *home.Server) error {
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

// Run は、cookie のコード付きでブラウザを開かせる（画面 cookie が切れたブラウザを、利用者が自分で渡し直す）。常駐が立っていなければ立てる
func (c *openCmd) Run() error {
	f := devHere(serverFlags{})
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := ensure(h, f)
	if err != nil {
		return err
	}
	fmt.Fprintln(os.Stderr, "vault:", residentDir(h))
	return openBrowser(s)
}

func openBrowser(s *home.Server) error {
	out, _, _, err := send(s, http.MethodPost, "api/open", nil, nil)
	if err != nil {
		return err
	}
	var done struct {
		OK     bool   `json:"ok"`
		Reason string `json:"reason"`
		Detail string `json:"detail"`
	}
	if err := json.Unmarshal(out, &done); err != nil {
		return err
	}
	if !done.OK {
		return fmt.Errorf("the browser could not be opened: %s %s", done.Reason, done.Detail)
	}
	return nil
}
