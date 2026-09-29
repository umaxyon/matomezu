package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/umaxyon/matomezu/internal/browser"
	"github.com/umaxyon/matomezu/internal/daemon"
	"github.com/umaxyon/matomezu/internal/server"
	"github.com/umaxyon/matomezu/web"
)

var version = "dev"

// サーバーを入れ替えたあと、開いていた画面がつなぎ直すのを待つ時間（画面は 1 秒ごとにつなぎ直しを試す）
const reconnectWait = 4 * time.Second

const usageText = `usage:
  matomezu open [-no-browser] [-page id] <file.json>   show the diagram (or the page of box id) in the browser (starts the background server)
  matomezu serve [-addr host:port] <file.json>   run a server in the foreground for one diagram
  matomezu check [-page id] <file.json>      print a summary of how the open browser laid it out (the first page, or the page of box id)
  matomezu set [-page id] <file.json> <id.key=value>... change fields of boxes (id "world" for the diagram), then print the summary
                                             an empty value removes the field, e.g. 12.x=
  matomezu stop                              stop the background server
  matomezu version
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usageText)
		os.Exit(2)
	}
	args := os.Args[2:]
	var err error
	switch os.Args[1] {
	case "open":
		err = open(args)
	case "serve":
		err = serve(args)
	case "check":
		err = check(args)
	case "set":
		err = set(args)
	case "stop":
		err = stop()
	case "daemon":
		err = runDaemon(args)
	case "version":
		fmt.Println(version)
	default:
		fmt.Fprint(os.Stderr, usageText)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "matomezu:", err)
		os.Exit(1)
	}
}

func newFlags(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	fs.Usage = func() { fmt.Fprint(os.Stderr, usageText) }
	return fs
}

// open は図をブラウザで見せる。バックグラウンドのサーバーが無ければ起動し、すぐに戻る。
// 1行目に URL を出す。LLM はブラウザを開けなかったとき、この URL をユーザーに伝える
func open(args []string) error {
	fs := newFlags("open")
	noBrowser := fs.Bool("no-browser", false, "print the URL without opening a browser")
	page := fs.String("page", "", "open the page of this box (a box with page: true) instead of the first page")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		os.Exit(2)
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	s, replaced, err := daemon.Ensure(context.Background(), exe, buildVersion(exe))
	if err != nil {
		return err
	}
	// 画面がつながっていれば、そのタブの中で図を開く（サーバーは、少しあとにつながった画面にも知らせる）
	res, err := daemon.Open(s, fs.Arg(0), true, *page)
	if err != nil {
		return err
	}
	// サーバーを入れ替えたときは、開いていた画面が同じ URL でつなぎ直すのを少し待つ（つながればブラウザを開かない）
	if replaced && res.Connections == 0 {
		for deadline := time.Now().Add(reconnectWait); time.Now().Before(deadline); time.Sleep(200 * time.Millisecond) {
			if res, err = daemon.Open(s, fs.Arg(0), false, ""); err != nil {
				return err
			}
			if res.Connections > 0 {
				break
			}
		}
	}
	url := s.URL("/?d=" + res.ID)
	if *page != "" {
		url += "&p=" + *page
	}
	fmt.Println(url)
	switch {
	case res.Connections > 0:
		fmt.Fprintln(os.Stderr, "Opened in the matomezu tab already open in the browser; it updates automatically when the file changes.")
	case *noBrowser:
	default:
		if err := browser.Open(url); err != nil {
			fmt.Fprintf(os.Stderr, "Could not open a browser: %v. Ask the user to open the URL above.\n", err)
		} else {
			fmt.Fprintln(os.Stderr, "Opened in the browser.")
		}
	}
	return nil
}

// 開発中のビルドは版がすべて dev なので、実行ファイルの更新時刻で見分ける。
// 作り直したら、古い画面を持った常駐サーバーを入れ替えるため
func buildVersion(exe string) string {
	if version != "dev" {
		return version
	}
	if st, err := os.Stat(exe); err == nil {
		return fmt.Sprintf("dev-%x", st.ModTime().UnixNano())
	}
	return version
}

// serve は1つの図のサーバーを前面で動かす（開発やデバッグ用）
func serve(args []string) error {
	fs := newFlags("serve")
	addr := fs.String("addr", "127.0.0.1:0", "address to listen on (port 0 picks a free port)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	hub := server.NewHub(ctx, web.FS)
	res, err := hub.Open(fs.Arg(0), false, "")
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return err
	}
	fmt.Printf("http://%s/?d=%s\n", ln.Addr(), res.ID)
	return run(ctx, ln, hub.Handler())
}

func stop() error {
	s := daemon.Running()
	if s == nil {
		fmt.Fprintln(os.Stderr, "No server is running.")
		return nil
	}
	return daemon.Shutdown(s)
}

// runDaemon は open から切り離して起動されるバックグラウンドのサーバー。
// 画面が1つもつながらない状態が idle 続くか、状態ファイルが別のサーバーのものになったら止まる
func runDaemon(args []string) error {
	fs := newFlags("daemon")
	idle := fs.Duration("idle", 30*time.Minute, "stop after this long with no browser connected")
	addr := fs.String("addr", "", "try this address first (the replaced server's), so open pages reconnect to the same URL")
	if err := fs.Parse(args); err != nil {
		return err
	}
	log.SetPrefix(fmt.Sprintf("[daemon %d] ", os.Getpid()))

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, stopNow := context.WithCancel(ctx)
	defer stopNow()

	var ln net.Listener
	var err error
	if *addr != "" {
		if ln, err = net.Listen("tcp", *addr); err != nil {
			log.Printf("could not reuse %s: %v", *addr, err)
		}
	}
	if ln == nil {
		if ln, err = net.Listen("tcp", "127.0.0.1:0"); err != nil {
			return err
		}
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	v := buildVersion(exe)
	st := &daemon.State{PID: os.Getpid(), Addr: ln.Addr().String(), Token: daemon.NewToken(), Version: v}
	hub := server.NewHub(ctx, web.FS, server.WithControl(st.Token, v, stopNow))
	if err := daemon.WriteState(st); err != nil {
		return err
	}
	defer daemon.RemoveState(st.PID)
	log.Printf("listening on %s", st.Addr)

	go func() {
		t := time.NewTicker(10 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if hub.Idle() > *idle {
					log.Print("idle, stopping")
					stopNow()
				}
				// 同時に起動した別のサーバーが状態ファイルを書いたら、つながりが無くなりしだい譲る
				if cur, _ := daemon.ReadState(); (cur == nil || cur.PID != st.PID) && hub.Idle() > 0 {
					log.Print("replaced by another server, stopping")
					stopNow()
				}
			}
		}
	}()
	err = run(ctx, ln, hub.Handler())
	log.Print("stopped")
	return err
}

func run(ctx context.Context, ln net.Listener, h http.Handler) error {
	hs := &http.Server{Handler: h, BaseContext: func(net.Listener) context.Context { return ctx }}
	go func() {
		<-ctx.Done()
		hs.Shutdown(context.Background())
	}()
	if err := hs.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
