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
	"path/filepath"
	"strings"
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
  matomezu start [-no-browser]               start the background server and, if no browser shows matomezu, open the master page in the browser
                                             and wait until it connects (with -no-browser, print the URL for the user to open and wait)
  matomezu open [-no-browser] [-page id] <file.json>   show the diagram (or the page with that id) in the browser (runs start first when needed)
                                             if the user is looking at another diagram, it goes to their mailbox and they are asked whether to open it
                                             a diagram that does not fit on its paper is not opened: the reason is printed and the browser shows it on the master page
                                             with -no-browser and no browser showing matomezu, it only prints the URL for the user to open
  matomezu serve [-addr host:port] <file.json>   run a server in the foreground for one diagram
  matomezu check [-page id] [-in ids] <file.json>   print a summary of how the user's screen lays it out (the first page, or the page with that id)
                                             it does not switch the user's screen; a page the user is not looking at is laid out off screen at the same size
                                             -in 2,5 also lists the children of boxes 2 and 5 (position relative to the box, and size)
  matomezu set [-page id] <file.json> <id.key=value>... change fields of boxes or edges (an edge id such as e3; "world" for the diagram)
                                             it only writes the file: run check for the layout, and notify to tell the user when the work is done
                                             an empty value removes the field, e.g. 12.x=; JSON values are allowed, e.g. e3.via=[280,140,400]
                                             link=1,4 adds an edge (its id is printed); link={"from":1,"to":4,"arrow":"end"} with fields
                                             unlink=1,4 or unlink=e3 removes an edge; 12.parent=4 moves box 12 into box 4 (12.parent= to the top level)
                                             world.key=value changes the diagram's world, or with -page that page's world (the page pattern childView and the tree root can't be changed, nor a box's type: link / book)
                                             12.page=p2 moves a top-level box to page p2, but never to a page of a different pattern
  matomezu notify -title text [-body text] [-page id] [-mail] [file.json]   tell the user something (once, when a piece of work is done)
                                             with a file, the notice offers to open that diagram (or page); -body can explain what changed
                                             it goes to the mailbox of the diagram the user is looking at and also shows a dialog; -mail only puts it in the mailbox
  matomezu focus [-mail] [-say text] [-button label] <file.json> <box id>   point at one box on the user's screen with a frame (not written to the file; the user closes it)
                                             in the diagram the user is looking at, it moves to the box's page; in another diagram, the user is asked first
                                             it fails while the user is busy (a dialog, dragging, typing) or has not responded to the previous focus
                                             check on that file then ends with a focus: line (not responded yet / asked / declined / responded)
                                             -say adds a short message in a bubble; -button adds a button to it, which makes it a one-question topic (see ask)
                                             -mail puts it in the mailbox instead (the box is shown when the user opens it); matomezu focus -clear removes your focus
  matomezu ask <file.json> '{"items":[{"box":"5","text":"OK?","choices":["yes","no"]}]}'   ask the user about boxes on one page, with bubbles on the screen (not written to the file)
                                             each item: box, text, choices (buttons), and optional id (default 1, 2, …), multi (pick several), input (also answer in words)
                                             short ones (20 full-width characters, up to 2 buttons of 6 characters in all) are bubbles; longer ones (150 at most) open in a drawer
                                             only one topic at a time, and not while a focus waits; it fails while the user is busy. it returns at once
  matomezu ask -status | -end | -hide id | -show id   the answers so far / end the topic (do it when you have enough, or to withdraw and ask again) / fold or open a bubble
  matomezu ask -wait                         wait until every question is responded or the topic ends (10 minutes at most), then print the answers
                                             only run it in the background (it wakes you when it ends); if you can't, don't use it and read -status instead
                                             when it ends with answers, the user may be watching the browser: tell them there that you read them (notify)
  matomezu ask -new                          print the answers only if the user responded since you last read them; otherwise print nothing
                                             while a topic is open, run it first on every user message (or set it as a hook on each message, e.g. Claude Code's
                                             UserPromptSubmit); print and say nothing more if it prints nothing
  matomezu tour -title text [-mail] <file.json> '{"steps":[{"box":"5","say":"the entrance"},{"box":"8","say":"it splits here"}]}'
                                             a guided tour: the user is asked to start it (start / decline / later from the mailbox; -mail: mailbox only),
                                             then each step frames one box (one box per step; never several) with say (40 full-width characters at most)
                                             a step can be in another page or book: add "path":"other.json". while it runs, the screen is locked
                                             it fails while a focus, a topic of questions or another tour is open, or while the user is busy
  matomezu tour -status | -end | -wait | -new   waiting / running / complete / interrupt; -end withdraws it; -wait and -new as for ask
                                             complete means the user saw every step; interrupt (declined or stopped) means treat it as not understood
  matomezu validate <file.json>              list the problems in the diagram data (same rules as the browser); exit status 1 if any
  matomezu close <file.json>...              close these diagrams in the browser (they stay registered and listed on the master page; open shows them again)
                                             closing a diagram in the browser also clears its LLM history
  matomezu history <file.json> [n]           list the changes made outside the browser (set, edits of the file) since the diagram was opened, newest last;
                                             with n, show change n in detail. "seen" means the user has seen it; "overwritten" means the user's undo replaced it before they saw it
  matomezu revert <file.json> <n>            undo change n of the history on the current file (boxes it added are removed with their children)
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
	case "start":
		err = startCmd(args)
	case "open":
		err = open(args)
	case "serve":
		err = serve(args)
	case "check":
		err = check(args)
	case "set":
		err = set(args)
	case "validate":
		err = validateCmd(args)
	case "close":
		err = closeCmd(args)
	case "notify":
		err = notifyCmd(args)
	case "focus":
		err = focusCmd(args)
	case "tour":
		err = tourCmd(args)
	case "ask":
		err = askCmd(args)
	case "history":
		err = historyCmd(args)
	case "revert":
		err = revertCmd(args)
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

// closeCmd は図のタブを画面で閉じる（タブの × と同じ。サーバーの登録は残る）。サーバーが動いていなければ、閉じるタブも無い
func closeCmd(args []string) error {
	fs := newFlags("close")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() == 0 {
		fs.Usage()
		os.Exit(2)
	}
	if daemon.Running() == nil {
		fmt.Println("no matomezu server is running; nothing to close")
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	// 版の違うサーバーなら入れ替える（close を知らない古いサーバーのため）。そのときは画面がつなぎ直すのを少し待つ
	s, replaced, err := daemon.Ensure(context.Background(), exe, buildVersion(exe))
	if err != nil {
		return err
	}
	var failed []string
	for _, path := range fs.Args() {
		res, err := daemon.Close(s, path)
		// 入れ替えたばかりなら、画面がつなぎ直すまで知らせ直す（つながっていない間の知らせは届かない）
		for deadline := time.Now().Add(reconnectWait); replaced && (err != nil && strings.Contains(err.Error(), "not open") || err == nil && res.Connections == 0) && time.Now().Before(deadline); {
			time.Sleep(200 * time.Millisecond)
			res, err = daemon.Close(s, path)
		}
		if err != nil {
			failed = append(failed, err.Error())
			continue
		}
		fmt.Printf("closed %s (%d browser connection(s))\n", path, res.Connections)
	}
	if len(failed) > 0 {
		return errors.New(strings.Join(failed, "; "))
	}
	return nil
}

func newFlags(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	fs.Usage = func() { fmt.Fprint(os.Stderr, usageText) }
	return fs
}

// screenWait は、ブラウザを開いてから画面がつながるまで待つ長さ。noBrowserWait は、URL をユーザーに開いてもらうときに待つ長さ
const (
	screenWait    = 30 * time.Second
	noBrowserWait = 2 * time.Minute
)

// serverUp はバックグラウンドのサーバーを起動し（版が違えば入れ替える）、画面（ブラウザの matomezu のタブ）がつながっているかを返す。
// 入れ替えたときは、開いていた画面が同じ URL でつなぎ直すのを少し待つ
func serverUp() (*daemon.State, bool, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, false, err
	}
	s, replaced, err := daemon.Ensure(context.Background(), exe, buildVersion(exe))
	if err != nil {
		return nil, false, err
	}
	if ok, _ := daemon.Screen(s); ok {
		return s, true, nil
	}
	return s, replaced && waitScreen(s, reconnectWait), nil
}

// waitScreen は画面がつながるまで d だけ待つ
func waitScreen(s *daemon.State, d time.Duration) bool {
	for deadline := time.Now().Add(d); ; time.Sleep(200 * time.Millisecond) {
		if ok, _ := daemon.Screen(s); ok {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
	}
}

// startScreen は、画面が無ければブラウザでマスターを開いて、画面がつながるまで待つ（matomezu start。open も中で使う）。
// noBrowser ならブラウザを開かず、マスターの URL を出してユーザーが開くのを待つ。画面がつながらなければ誤り
func startScreen(noBrowser bool) (*daemon.State, error) {
	s, ok, err := serverUp()
	if err != nil || ok {
		return s, err
	}
	url := s.URL("/?master=1")
	if noBrowser {
		fmt.Println(url)
		fmt.Fprintln(os.Stderr, "Ask the user to open the URL above; waiting for the browser to connect.")
		if !waitScreen(s, noBrowserWait) {
			return nil, errors.New("no browser connected; ask the user to open " + url + " and run the command again")
		}
		return s, nil
	}
	if err := browser.Open(url); err != nil {
		return nil, fmt.Errorf("could not open a browser: %v; ask the user to open %s and run the command again", err, url)
	}
	if !waitScreen(s, screenWait) {
		return nil, errors.New("the browser did not connect; ask the user to open " + url + " and run the command again")
	}
	return s, nil
}

// startCmd は画面を用意する（matomezu start）。図は開かない
func startCmd(args []string) error {
	fs := newFlags("start")
	noBrowser := fs.Bool("no-browser", false, "print the URL of the master page without opening a browser, and wait for the user to open it")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		fs.Usage()
		os.Exit(2)
	}
	s, err := startScreen(*noBrowser)
	if err != nil {
		return err
	}
	fmt.Println(s.URL("/?master=1"))
	fmt.Fprintln(os.Stderr, "The browser shows matomezu.")
	return nil
}

// open は図をブラウザで見せる。画面が無ければ start と同じく用意してから（マスターが出る）、その画面に届ける。
// 届ける前に画面が紙に収まるかを判定し、収まらなければ届けずに理由を返す（画面はマスターで知らせる。docs/PAPER-plan.md の 4.6 の 7）。
// 1 行目に URL を出す
func open(args []string) error {
	fs := newFlags("open")
	noBrowser := fs.Bool("no-browser", false, "do not open a browser when none shows matomezu: register the diagram and print its URL for the user to open")
	page := fs.String("page", "", "open this page (an id in pages) instead of the first page")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		os.Exit(2)
	}
	// ブラウザを開かないときは、画面が無くても待たない（届けておき、URL を開いた画面がブックを開くときに判定する。収まらなければマスターで知らせる）
	var s *daemon.State
	var err error
	screen := true
	if *noBrowser {
		s, screen, err = serverUp()
	} else {
		s, err = startScreen(false)
	}
	if err != nil {
		return err
	}
	res, err := daemon.Ask(s, fs.Arg(0), *page)
	if err != nil {
		return err
	}
	if len(res.Over) > 0 {
		return errors.New("not opened: " + server.OverText("the diagram does not fit on its paper (the browser shows this on the master page):", res.Over))
	}
	fmt.Println(bookURL(s, res.ID, *page))
	if !screen {
		fmt.Fprintln(os.Stderr, "No browser shows matomezu: ask the user to open the URL above. If the diagram does not fit on its paper, the browser shows why on the master page (matomezu check reports it too).")
		return nil
	}
	fmt.Fprintln(os.Stderr, "Sent to the matomezu tab in the browser (if the user is looking at another diagram, they are asked whether to open it); it updates automatically when the file changes.")
	return nil
}

// bookURL はブック（page があればそのページ）を開く画面の URL
func bookURL(s *daemon.State, id, page string) string {
	url := s.URL("/?d=" + id)
	if page != "" {
		url += "&p=" + page
	}
	return url
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
	res, err := hub.Open(fs.Arg(0))
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
	addr := fs.String("addr", "", "try this address first (the replaced or last stopped server's), so open pages reconnect to the same URL")
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
	var hub *server.Hub
	// stop で止めるときは、画面がつながっていたかを覚える（次の open で、その画面がつなぎ直すのを待つため）
	shutdown := func() {
		daemon.WriteLast(daemon.Last{Addr: st.Addr, Pages: hub.Idle() == 0})
		stopNow()
	}
	opts := []server.Option{server.WithControl(st.Token, v, shutdown)}
	// 登録した図を覚えておき、入れ替わったり止まったりしたあとも開き直せるようにする
	if dir, err := daemon.Dir(); err == nil {
		opts = append(opts, server.WithStore(filepath.Join(dir, "docs.json")))
	}
	hub = server.NewHub(ctx, web.FS, opts...)
	if err := daemon.WriteState(st); err != nil {
		return err
	}
	daemon.WriteLast(daemon.Last{Addr: st.Addr})
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
