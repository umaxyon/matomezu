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
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/alecthomas/kong"
	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
	"github.com/umaxyon/matomezu/internal/browser"
	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/home"
	"github.com/umaxyon/matomezu/internal/mcp"
	"github.com/umaxyon/matomezu/internal/server"
	"github.com/umaxyon/matomezu/internal/storage"
	"github.com/umaxyon/matomezu/web"
)

var version = devVersion

// DefaultAddr は常駐が待つ場所。画面の設定のうちブラウザに残すもの（localStorage）はアドレスごとに分かれるので、ポートは毎回同じにする
const DefaultAddr = "127.0.0.1:7230"

// 裏で立てた常駐が待ち受けを始めるまで待つ時間
const startWait = 10 * time.Second

type cli struct {
	Serve        serveCmd        `cmd:"" help:"Run the server in the foreground."`
	Start        startCmd        `cmd:"" help:"Start the server in the background unless it is running, and print its URL."`
	Stop         stopCmd         `cmd:"" help:"Stop the background server."`
	Open         openCmd         `cmd:"" help:"Open the screen in your browser and give it the server's screen cookie (for a browser that has none). Nothing is printed."`
	MCP          mcpCmd          `cmd:"" name:"mcp" help:"Serve the MCP tools for an AI on stdin and stdout (starts the server unless it is running)."`
	Annotations  annotationsCmd  `cmd:"" help:"Print the annotations (such as the user's notes and marks) that wait for AI's answer, and AI's changes the user undid before seeing them, for an AI's hook. Prints nothing when there are none or the server is not running."`
	Talked       talkedCmd       `cmd:"" help:"Tell the server the user talked to AI, for an AI's hook that passes the hook's JSON on stdin (the notes AI has read start their expiry; the session is tied to the participant who joined from it, and a participant who just joined is welcomed in the hook's JSON). Prints --context when there is nothing else to say, and does nothing when the server is not running."`
	Watch        watchCmd        `cmd:"" help:"Print one line for each thing the user did on the screen that should wake AI (such as accepting AI's request to join), for an AI's background monitor. Waits for the server and reconnects; prints nothing else."`
	Model        modelCmd        `cmd:"" help:"Tell the server the model of AI's session, for an AI's hook (SessionStart or PostModelSwitch) that passes the hook's JSON on stdin (model or to_model). Does nothing when the JSON has no model or the server is not running."`
	ClaudeCode   claudeCodeCmd   `cmd:"" name:"claude-code" help:"Commands that matomezu's Claude Code plugin runs (its MCP, hooks and monitor)."`
	Codex        codexCmd        `cmd:"" help:"Commands that matomezu's Codex plugin runs (its MCP, hooks, and the command that hands wake notices to a Codex conversation)."`
	Opencode     opencodeCmd     `cmd:"" help:"Commands that matomezu's opencode plugin runs (its MCP, and the command that hands wake notices to an opencode conversation)."`
	PluginPath   pluginPathCmd   `cmd:"" name:"plugin-path" help:"Print the folder of matomezu's plugin for an AI program, to add it from (such as claude plugin marketplace add)."`
	Plugin       pluginCmd       `cmd:"" help:"Manage matomezu plugins for AI clients."`
	PluginRemove pluginRemoveCmd `cmd:"" name:"plugin-remove" help:"Before removing matomezu (npm uninstall -g matomezu): stop the server and remove matomezu's plugin from the AI programs (Claude Code, Codex and opencode). Your books are kept."`
	Version      versionCmd      `cmd:"" help:"Print the version."`
}

// 常駐の立て方（serve と start で共通）
type serverFlags struct {
	Addr   string   `default:"${addr}" help:"Address to listen on (127.0.0.1 only)."`
	Web    string   `help:"Serve the screen from this folder instead of the one built in." type:"existingdir"`
	Plugin []string `help:"Add the plugin in this developer project folder (with matomezu.json). Repeat for more." type:"existingdir"`
}

func (f serverFlags) args() []string {
	a := []string{"--addr", f.Addr}
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

type mcpCmd struct {
	serverFlags
	Resident        bool     `help:"With a deliver command: start it once and keep it running (as watch --resident)."`
	SessionEndsWith string   `enum:"program,mcp," default:"" help:"Say which process lives as long as this session, so that when it is gone the session has ended and matomezu may remove the participant: program is the AI's program (when it runs this one session only), mcp is this MCP's own process (or the entry that started it). Leave it out when neither can be said."`
	MetaSession     []string `name:"meta-session" help:"Where in a tool call's _meta the AI program puts its session id (a JSON Pointer such as /ai.opencode~1sessionID), looked at after /sessionId and /threadId. Repeat for more."`
	MetaModel       string   `name:"meta-model" help:"Where in a tool call's _meta the AI program puts its model (a JSON Pointer such as /x-codex-turn-metadata/model)."`
	Deliver         []string `arg:"" optional:"" passthrough:"" help:"A command (after --) that hands each wake notice to the AI, as watch does with it. The MCP then also watches for the notices of its host program while it runs (for an AI program that has no background monitor)."`
	// NotClaudeCode は、Claude Code でない AI の MCP（codex mcp・opencode mcp）。Claude Code のセッション id の環境変数を読まない
	// （Claude Code の Bash から起こされた AI は、その環境変数を受け継ぐ。読むと、常駐がその Claude Code の参加者と取り違える）
	NotClaudeCode bool `kong:"-"`
}

type annotationsCmd struct{}

type talkedCmd struct {
	Context string `help:"Text the hook adds to what it tells AI (such as the output of annotations). It is printed as it is when there is nothing to say as JSON."`
	Host    string `help:"Process id of AI's host program (such as Claude Code). The server ties a new session id of the same process to its participant (after /clear)."`
	Format  string `default:"hook" enum:"hook,split" help:"Shape of the answer: hook (the hook's JSON that Claude Code, Codex and Gemini CLI read; --context as it is when there is nothing else to say) or split (one JSON for any AI program: message to show the user, forAi to add to what AI reads this turn, sessionTitle for the conversation; nothing when all are empty)."`
	Woken   bool   `help:"The turn was started by a wake notice (such as matomezu deliver), not by the user talking."`
}

type modelCmd struct {
	Host string `help:"Process id of AI's host program (such as Claude Code). The server ties a new session id of the same process to its participant (after /clear)."`
}

type watchCmd struct {
	Host      string        `help:"Process id of AI's host program (such as Claude Code). Only the lines for the participant who joined from that process are printed. Leave it out when the program is not known: then --session alone says whose lines are printed (one of the two is needed)."`
	Session   string        `help:"Session id the host program started with (Claude Code: CLAUDE_CODE_SESSION_ID). When both this and the one MCP sent on join are known, they must match too."`
	MaxLine   int           `help:"The longest line the host program takes (characters). Longer lines are split. 0 for no limit."`
	MaxNotice int           `help:"The longest notice the host program takes at once (characters, counting the line breaks). A message too long for it comes as a short notice, and its text with the next matomezu call. 0 for no limit."`
	Gap       time.Duration `help:"How long to wait after each notice before the next (so the host program does not join them into one notice)."`
	Resident  bool          `help:"Start the command after -- once and keep it running: write one JSON line {id, session, text} to its stdin for each notice, and read one JSON line {id, result} (delivered, absent or failed) from its stdout."`
	Deliver   []string      `arg:"" optional:"" passthrough:"" help:"A command (after --) that hands each notice to the AI, instead of printing it: started for each notice with the text on stdin, the session id of the conversation in MATOMEZU_SESSION and the notice id in MATOMEZU_WAKE_ID; exit 0 when delivered, 3 when the AI's program does not have that conversation, anything else when it failed."`
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
	// 期限の過ぎたアノテーションを、時間で消す
	go func() {
		for now := range time.Tick(server.ExpireEvery) {
			if err := hub.Expire(now); err != nil {
				fmt.Fprintln(os.Stderr, "expire:", err)
			}
		}
	}()
	// 呼ばれないビジターを、時間で退室させる
	go func() {
		for now := range time.Tick(server.VisitorSweepEvery) {
			if err := hub.LeaveIdleVisitors(now); err != nil {
				fmt.Fprintln(os.Stderr, "visitors:", err)
			}
		}
	}()
	// 変換できないか台帳アセンブルで食い違う追加プラグインは外して立て、理由をログに残す（ほかのブックまで開けなくしない）
	for _, dir := range c.Plugin {
		if _, err := hub.LinkPlugin(dir); err != nil {
			fmt.Fprintf(os.Stderr, "plugin %s is not added: %v\n", dir, err)
		}
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
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := ensure(h, c.serverFlags)
	if err != nil {
		return err
	}
	fmt.Println(s.URL)
	if c.Open {
		return openBrowser(s)
	}
	// 画面 cookie の無いブラウザは、この URL を開いても断られる（URL は標準出力のまま、案内は標準エラーへ）
	fmt.Fprintln(os.Stderr, "Run matomezu start --open to give your browser access to the screen.")
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
	// 渡すコマンドがあれば、起こす知らせの watch も並べて動かす（標準出力は MCP が使うので、渡すコマンドが無いときは動かさない）
	host := hostProcess()
	session := os.Getenv(claudelaunch.SessionEnv) // プラグインを使わずに matomezu mcp を登録した Claude Code でも、セッション id を添える
	if c.NotClaudeCode {
		session = ""
	}
	if len(deliverCommand(c.Deliver)) > 0 {
		w := &watchCmd{Host: host, Session: session, Resident: c.Resident, Deliver: c.Deliver}
		go func() {
			if err := w.Run(); err != nil {
				fmt.Fprintln(os.Stderr, "matomezu mcp: wake notices are not handed to the AI:", err)
			}
		}()
	}
	return mcp.Serve(os.Stdin, os.Stdout, &httpAPI{s: s, reconnect: func() (*home.Server, error) { return ensure(h, c.serverFlags) }}, version, envName(), gitBranch, host, session, sessionPid(c.SessionEndsWith, host), sessionPidSpace(c.SessionEndsWith), mcp.Meta{Session: c.MetaSession, Model: c.MetaModel})
}

// sessionPid は、--session-ends-with の値 endsWith が指す、セッションと同じだけ生きるプロセスの id（空なら名乗らない）。
// program は AI のプログラム（親をたどった host）。mcp はこの MCP のプロセスで、npm の node の入口を通ったなら（入口が親なら）その入口のプロセス
func sessionPid(endsWith, host string) string {
	switch endsWith {
	case "program":
		return host
	case "mcp":
		if entry := os.Getenv(entryPIDEnv); entry != "" && entry == strconv.Itoa(os.Getppid()) {
			return entry
		}
		return strconv.Itoa(os.Getpid())
	}
	return ""
}

// sessionPidSpace は、セッションのプロセスを名乗るとき（endsWith が空でないとき）の、プロセス id が通じる範囲の印
func sessionPidSpace(endsWith string) string {
	if endsWith == "" {
		return ""
	}
	return server.ProcessSpace()
}

// awaitingItem は、常駐の api/ai/awaiting が返す、AI の応えを待つアノテーション 1 つ（brief は種類の aiBrief の 1 行。無ければ空）
type awaitingItem struct {
	Book       string          `json:"book"`
	Title      string          `json:"title"`
	Annotation json.RawMessage `json:"annotation"`
	Brief      string          `json:"brief"`
}

// writeAwaiting は、待つアノテーションを、ブックごとの見出しと、その下に 1 件 1 行（ページ・種類の id・アノテーションの id・1 行）で書く。
// 中身の全文は書かない（AI が read_page で読む）。待つ物が無ければ何も書かない
func writeAwaiting(out io.Writer, awaiting []awaitingItem) {
	if len(awaiting) == 0 {
		return
	}
	fmt.Fprintf(out, "matomezu: %d annotation(s), such as the user's notes and marks, wait for your answer. "+
		"Answer each as its kind says (see actions), with on.page set to the page of its line. A line is only what tells them apart: read_page shows what it stands on and the whole text of one that ends with … and its length.\n", len(awaiting))
	last := ""
	for _, a := range awaiting {
		if a.Book != last {
			fmt.Fprintf(out, "- book %q (%s)\n", a.Title, a.Book)
			last = a.Book
		}
		var head struct {
			ID         string  `json:"id"`
			Annotation string  `json:"annotation"`
			Page       *string `json:"page"`
		}
		_ = json.Unmarshal(a.Annotation, &head)
		page := "no page"
		if head.Page != nil {
			page = "page " + *head.Page
		}
		line := fmt.Sprintf("  - %s, %s %s", page, head.Annotation, head.ID)
		if a.Brief != "" {
			line += fmt.Sprintf(": %q", a.Brief)
		}
		fmt.Fprintln(out, line)
	}
}

// Run は、AI の応えを待つアノテーションと、見られる前に利用者が戻した AI の変更を、AI に読ませる短い文で書き出す（AI のフックが、ターンの始まりに添える）。
// 常駐を立てず、立っていない・答えない・待つ物が無いときは何も書かない（AI のターンを止めない）
func (c *annotationsCmd) Run() error {
	writeAnnotations(os.Stdout)
	return nil
}

// writeAnnotations は、AI の応えを待つアノテーションと、AI に知らせる事（利用者が見る前に戻した変更など）を out に書く。常駐が立っていなければ何も書かない
func writeAnnotations(out io.Writer) {
	h, err := openHome()
	if err != nil {
		return
	}
	s, err := running(h)
	if err != nil || s == nil {
		return
	}
	body, _, _, err := send(s, http.MethodGet, "api/ai/awaiting", nil, nil)
	if err != nil {
		return
	}
	var got struct {
		Awaiting []awaitingItem `json:"awaiting"`
		Undone   []struct {
			Book  string          `json:"book"`
			Title string          `json:"title"`
			At    string          `json:"at"`
			Lost  json.RawMessage `json:"lost"`
		} `json:"undone"`
		Failed []struct {
			Book    string   `json:"book"`
			Title   string   `json:"title"`
			Key     string   `json:"key"`
			Changed []string `json:"changed"`
		} `json:"failed"`
		Removed []removedTicket `json:"removed"`
	}
	if json.Unmarshal(body, &got) != nil {
		return
	}
	writeAwaiting(out, got.Awaiting)
	if len(got.Undone) > 0 {
		fmt.Fprintf(out, "matomezu: %d change(s) you made were undone by the user before they saw them. "+
			"Do not redo them on your own; ask the user if they are still needed. lost is what was put back and the values you had written.\n", len(got.Undone))
		for _, u := range got.Undone {
			fmt.Fprintf(out, "- book %q (%s) at %s: %s\n", u.Title, u.Book, u.At, u.Lost)
		}
	}
	if len(got.Failed) > 0 {
		fmt.Fprintf(out, "matomezu: %d change(s) you sent for the user to apply could not be applied (what they change was changed or removed after you sent them, "+
			"or one of the changes was refused), so nothing was changed. Read the book again and think again (change it yourself, or send a new proposal). changed is what was changed or removed.\n", len(got.Failed))
		for _, f := range got.Failed {
			fmt.Fprintf(out, "- book %q (%s), %s: changed %v\n", f.Title, f.Book, f.Key, f.Changed)
		}
	}
	writeRemoved(out, got.Removed)
}

// removedTicket は、郵便が消えたと記した AI 編集チケット 1 つ（cause は上限で消えた limit か、利用者が消した user）
type removedTicket struct {
	Book  string `json:"book"`
	Title string `json:"title"`
	Key   string `json:"key"`
	Cause string `json:"cause"`
}

// writeRemoved は、反映される前に消えた変更提案を、消えたわけごとに AI 向けの文にして w に書く（無ければ何も書かない）
func writeRemoved(w io.Writer, removed []removedTicket) {
	for _, c := range []struct{ cause, text string }{
		{"limit", "were removed by the mailbox limit before the user applied them, so nothing was changed. Send them again if they are still needed."},
		{"user", "were removed by the user without applying them, so nothing was changed. Do not send them again unless the user asks."},
	} {
		var list []removedTicket
		for _, r := range removed {
			if r.Cause == c.cause {
				list = append(list, r)
			}
		}
		if len(list) == 0 {
			continue
		}
		fmt.Fprintf(w, "matomezu: %d change(s) you sent for the user to apply %s\n", len(list), c.text)
		for _, r := range list {
			fmt.Fprintf(w, "- book %q (%s), %s\n", r.Title, r.Book, r.Key)
		}
	}
}

// Run は、AI のターンの始まりを常駐に知らせる（AI のフックが呼ぶ。フックの JSON が標準入力に来る）。
// 常駐を立てず、立っていない・答えないときは何もしない（AI のターンを止めない。--context があればそれだけ書く）
func (c *talkedCmd) Run() error {
	hook := stdinHook()
	hook.Host = c.Host
	hook.Woken = c.Woken
	talked(os.Stdout, hook, c.Context, c.Format, runningAPI("api/ai/talked"))
	return nil
}

// Run は、AI のセッションのモデルを常駐に知らせる（AI のフックが呼ぶ。フックの JSON が標準入力に来る）。
// 常駐を立てず、立っていない・答えないときは何もしない
func (c *modelCmd) Run() error {
	hook := stdinHook()
	hook.Host = c.Host
	sendModel(hook, runningAPI("api/ai/model"))
	return nil
}

// stdinHook は、標準入力に来たフックの JSON（端末なら読まない）
func stdinHook() hookInput {
	if in, err := os.Stdin.Stat(); err == nil && in.Mode()&os.ModeCharDevice == 0 {
		return readHookInput(os.Stdin)
	}
	return hookInput{}
}

// runningAPI は、立っている常駐の POST path を呼ぶ口（立っていなければ nil。常駐を立てない）
func runningAPI(path string) hookAPI {
	h, err := openHome()
	if err != nil {
		return nil
	}
	s, err := running(h)
	if err != nil || s == nil {
		return nil
	}
	return func(body []byte) ([]byte, error) {
		out, _, _, err := send(s, http.MethodPost, path, body, nil)
		return out, err
	}
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
			// 同時に起動した別のプロセスの常駐が先に立っていれば、それを使う
			if s, _ := running(h); s != nil {
				return s, nil
			}
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

// httpAPI は、合言葉を付けて常駐の AI の入口を呼ぶ。
// 常駐を立て直すと合言葉もアドレスの先も変わるので、401 か、つなげなかった（送る前に断られた）ときは、
// reconnect でつなぎ方を取り直して（止まっていれば立て直して）1 度だけやり直す
type httpAPI struct {
	mu        sync.Mutex
	s         *home.Server
	reconnect func() (*home.Server, error)
}

func (a *httpAPI) Get(path string, header http.Header) (json.RawMessage, http.Header, error) {
	return a.do(http.MethodGet, path, nil, header)
}

func (a *httpAPI) Post(path string, body any, header http.Header) (json.RawMessage, http.Header, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, nil, err
	}
	return a.do(http.MethodPost, path, b, header)
}

func (a *httpAPI) do(method, path string, body []byte, header http.Header) (json.RawMessage, http.Header, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	out, reply, stale, err := send(a.s, method, path, body, header)
	if !stale {
		return out, reply, err
	}
	s, rerr := a.reconnect()
	if rerr != nil {
		return nil, nil, errors.Join(err, rerr)
	}
	a.s = s
	out, reply, _, err = send(a.s, method, path, body, header)
	return out, reply, err
}

// envName は MCP が参加のときに常駐へ渡す環境名（runtime.GOOS。Linux の中で WSL と分かれば wsl- を頭に付ける）
func envName() string {
	if runtime.GOOS == "linux" {
		if os.Getenv("WSL_DISTRO_NAME") != "" {
			return "wsl-linux"
		}
		if v, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil && strings.Contains(strings.ToLower(string(v)), "microsoft") {
			return "wsl-linux"
		}
	}
	return runtime.GOOS
}

// gitBranchWait は、git のブランチを読むのを待つ長さ
const gitBranchWait = time.Second

// gitBranch は、MCP が呼び出しのたびに常駐へ添える、作業フォルダの git のブランチ（git が無い・リポジトリでない・ブランチに居ない・待ちきれないなら空）
func gitBranch() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), gitBranchWait)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "-C", dir, "branch", "--show-current").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// send は 1 度だけ呼ぶ。stale は、つなぎ方が古いかもしれない（401 か、つなげなかった）とき。
// 送ったあとに答えが来なかったときは、常駐がもう行ったかもしれないので stale にしない
func send(s *home.Server, method, path string, body []byte, header http.Header) (out json.RawMessage, reply http.Header, stale bool, err error) {
	res, err := request(s, method, path, body, 60*time.Second, header)
	if err != nil {
		var op *net.OpError
		return nil, nil, errors.As(err, &op) && op.Op == "dial", fmt.Errorf("the matomezu server did not answer: %w", err)
	}
	defer res.Body.Close()
	out, err = io.ReadAll(res.Body)
	if err != nil {
		return nil, nil, false, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, nil, res.StatusCode == http.StatusUnauthorized, &mcp.HostError{Method: method, Path: path, Status: res.Status, Code: res.StatusCode, Text: string(bytes.TrimSpace(out))}
	}
	return out, res.Header, false, nil
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

// Run は、cookie のコード付きでブラウザを開かせる（画面 cookie が切れたブラウザを、利用者が自分で渡し直す）。常駐が立っていなければ立てる
func (c *openCmd) Run() error {
	h, err := openHome()
	if err != nil {
		return err
	}
	s, err := ensure(h, serverFlags{Addr: DefaultAddr})
	if err != nil {
		return err
	}
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

func (versionCmd) Run() error {
	fmt.Println(version)
	return nil
}

// call は合言葉を付けて常駐の API を本文なしで呼ぶ（答えは 3 秒だけ待つ）
func call(s *home.Server, method, path string) (*http.Response, error) {
	res, err := request(s, method, path, nil, 3*time.Second, nil)
	if err != nil {
		return nil, err
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s %s: %s", method, path, res.Status)
	}
	return res, nil
}

// request は合言葉を付けて常駐の API を 1 度呼ぶ（body があれば JSON で送る。答えは timeout だけ待つ）
func request(s *home.Server, method, path string, body []byte, timeout time.Duration, header http.Header) (*http.Response, error) {
	req, err := http.NewRequest(method, s.URL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	for k, v := range header {
		req.Header[k] = v
	}
	req.Header.Set("Authorization", "Bearer "+s.Token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return (&http.Client{Timeout: timeout}).Do(req)
}
