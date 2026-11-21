package main

// AI を起こす知らせ（watch）: 常駐の GET /api/ai/watch につなぎ、利用者が画面で行った事のうち AI を起こす物（参加の要求が受け入れられた・断られたなど）と、
// ほかの AI からの AI 間メッセージを AI に渡し、渡せたかを常駐に返す（POST /api/ai/watch/ack）。
// 渡し方は 3 つ（AI の種類は見ない。どれを使うかは clients/<AI の名前> が引数で決める）:
//   - 何も付けなければ、標準出力に書く。書けたら渡せた（Claude Code のプラグインの monitor。書いた行で AI のターンが始まる）。
//     --escaped を付けると、知らせ 1 つを JSON の文字列の 1 行で書く（改行を含む知らせも 1 行で渡り、常駐は改行を受ける形で流す。Claude Desktop のプラグインの mod）
//   - -- のあとに渡すコマンドを付けると、知らせごとにそのコマンドを起動する。本文は標準入力、宛て先の会話のセッション id は環境変数 MATOMEZU_SESSION、
//     知らせの id は MATOMEZU_WAKE_ID で渡す。終わりの値が 0 なら渡せた、3 なら宛て先の会話がその AI のプログラムに無い、ほかは失敗
//   - --resident を付けると、渡すコマンドを 1 度だけ起動して立てたままにし、知らせごとに標準入力に 1 行の JSON {"id", "session", "text"} を書き、
//     標準出力の 1 行の JSON {"id", "result"}（result は delivered・absent・failed）で答えを受ける
// 渡すコマンドが deliverTimeout までに答えなければ、止めて失敗とする。
// 受け取る AI のプログラムの上限（1 行・1 回の知らせ）と知らせの間は、--max-line・--max-notice・--gap で名乗る（常駐が合わせて流す）。
// --host の AI のプログラムのプロセス id から join した参加者への知らせだけが届く

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/home"
	"github.com/umaxyon/matomezu/internal/server"
)

type watchCmd struct {
	Host      string        `help:"Process id of AI's host program (such as Claude Code). Only the lines for the participant who joined from that process are printed. Leave it out when the program is not known: then --session alone says whose lines are printed (one of the two is needed)."`
	Session   string        `help:"Session id the host program started with (Claude Code: CLAUDE_CODE_SESSION_ID). When both this and the one MCP sent on join are known, they must match too."`
	MaxLine   int           `help:"The longest line the host program takes (characters). Longer lines are split. 0 for no limit."`
	MaxNotice int           `help:"The longest notice the host program takes at once (characters, counting the line breaks). A message too long for it comes as a short notice, and its text with the next matomezu call. 0 for no limit."`
	Gap       time.Duration `help:"How long to wait after each notice before the next (so the host program does not join them into one notice)."`
	Escaped   bool          `help:"Print each notice as one line, a JSON string (its line breaks escaped), so a reader that takes one line per notice gets notices with line breaks whole; then a message from another AI comes with its sender and its text on separate lines."`
	Resident  bool          `help:"Start the command after -- once and keep it running: write one JSON line {id, session, text} to its stdin for each notice, and read one JSON line {id, result} (delivered, absent or failed) from its stdout."`
	Deliver   []string      `arg:"" optional:"" passthrough:"" help:"A command (after --) that hands each notice to the AI, instead of printing it: started for each notice with the text on stdin, the session id of the conversation in MATOMEZU_SESSION and the notice id in MATOMEZU_WAKE_ID; exit 0 when delivered, 3 when the AI's program does not have that conversation, anything else when it failed."`
}

// wakeOut は、常駐が通り道に流す知らせ 1 つ（server.WakeOut と同じ形）
type wakeOut struct {
	Line    int64  `json:"line"`
	ID      string `json:"id"`
	Session string `json:"session"`
	Text    string `json:"text"`
}

// 渡した結果（常駐の WakeDelivered・WakeAbsent・WakeFailed と同じ名前）
const (
	deliverDelivered = "delivered"
	deliverAbsent    = "absent"
	deliverFailed    = "failed"
)

// deliverAbsentExit は、知らせごとに起動する渡すコマンドが「宛て先の会話がその AI のプログラムに無い」と答える終わりの値
const deliverAbsentExit = 3

// deliverTimeout は、渡すコマンドの答えを待つ上限
const deliverTimeout = time.Minute

// deliverer は、知らせ 1 つを AI に渡し、結果の名前を返す物
type deliverer interface {
	deliver(w wakeOut) string
	close()
}

// watchRetry は、常駐が立っていない・切れたときに、つなぎ直すまで待つ間
const watchRetry = 3 * time.Second

// Run は、常駐の AI を起こす知らせ（GET /api/ai/watch）につなぎ、届いた 1 行ずつを標準出力に書く。常駐が立っていなければ待ち、切れたらつなぎ直す（常駐は立てない）。
// --host のプロセスか、起動したときの親の列のどれかか、行を読む AI のプログラムが居なくなったら終える（AI のプログラムが閉じたのに残らないように）
func (c *watchCmd) Run() error {
	if c.Host == "" && c.Session == "" {
		return errors.New("--host or --session is needed (whose notices to print)")
	}
	alive := c.alive()
	d := c.deliverer(os.Stdout)
	defer d.close()
	for alive() {
		if s := runningServer(); s != nil {
			_ = watchOnce(s, c.query(), alive, d)
		}
		time.Sleep(watchRetry)
	}
	return nil
}

// deliverer は、引数で決めた渡し方
func (c *watchCmd) deliverer(out io.Writer) deliverer {
	args := deliverCommand(c.Deliver)
	switch {
	case len(args) == 0:
		return printDeliverer{out: out, escaped: c.Escaped}
	case c.Resident:
		return &residentDeliverer{args: args}
	default:
		return commandDeliverer{args: args}
	}
}

// deliverCommand は、-- のあとに受けた渡すコマンド（kong の passthrough は、区切りの -- も頭に残す）
func deliverCommand(args []string) []string {
	if len(args) > 0 && args[0] == "--" {
		return args[1:]
	}
	return args
}

// runningServer は、立っていて答える常駐のつなぎ方（無ければ nil）
func runningServer() *home.Server {
	h, err := openHome()
	if err != nil {
		return nil
	}
	s, err := running(h)
	if err != nil {
		return nil
	}
	return s
}

// query は、常駐の起こす知らせの口に渡す問い合わせ（宛て先と、受け取る側の流し方）
func (c *watchCmd) query() string {
	q := url.Values{"host": {c.Host}, "session": {c.Session}}
	if c.MaxLine > 0 {
		q.Set("maxLine", strconv.Itoa(c.MaxLine))
	}
	if c.MaxNotice > 0 {
		q.Set("maxNotice", strconv.Itoa(c.MaxNotice))
	}
	if c.Gap > 0 {
		q.Set("gap", strconv.FormatInt(c.Gap.Milliseconds(), 10))
	}
	if c.Escaped {
		q.Set("breaks", "1")
	}
	return q.Encode()
}

// alive は、watch を続けるか（--host のプロセスと、起動したときの親の列が居て、行を標準出力に書くなら、その読み手が居る間）
func (c *watchCmd) alive() func() bool {
	ancestors := ancestorsAlive()
	printing := len(deliverCommand(c.Deliver)) == 0
	return func() bool {
		return ancestors() && (c.Host == "" || server.ProcessAlive(c.Host)) && (!printing || stdoutRead())
	}
}

// watchOnce は、常駐 s の起こす知らせ（問い合わせ query）につなぎ、切れるまで、届いた知らせを d で渡して、結果を常駐に返す。alive が false になったら終える
func watchOnce(s *home.Server, query string, alive func() bool, d deliverer) error {
	res, err := request(s, http.MethodGet, "api/ai/watch?"+query, nil, 0, nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("watch: %s", res.Status)
	}
	return readWakes(res.Body, alive, func(w wakeOut) {
		body, _ := json.Marshal(map[string]any{"line": w.Line, "id": w.ID, "result": d.deliver(w)})
		if r, err := request(s, http.MethodPost, "api/ai/watch/ack", body, 10*time.Second, nil); err == nil {
			r.Body.Close()
		}
	})
}

// readWakes は、SSE の流れ r の wake の知らせを 1 つずつ on に渡す（ほかの知らせは読み捨てる）。行を読むたびに still を聞き、偽なら終える（keep が間を置いて届く）
func readWakes(r io.Reader, still func() bool, on func(wakeOut)) error {
	scan := bufio.NewScanner(r)
	scan.Buffer(make([]byte, 64*1024), 1<<20)
	name := ""
	for scan.Scan() && still() {
		line := scan.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: ") && name == "wake":
			var w wakeOut
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &w) == nil && w.Text != "" {
				on(w)
			}
		case line == "":
			name = ""
		}
	}
	return scan.Err()
}

// printDeliverer は、標準出力に書いて渡す（書けたら渡せた）。escaped なら知らせ 1 つを JSON の文字列の 1 行で書く
type printDeliverer struct {
	out     io.Writer
	escaped bool
}

func (p printDeliverer) deliver(w wakeOut) string {
	text := w.Text
	if p.escaped {
		b, _ := json.Marshal(text)
		text = string(b)
	}
	if _, err := fmt.Fprintln(p.out, text); err != nil {
		return deliverFailed
	}
	return deliverDelivered
}

func (printDeliverer) close() {}

// commandDeliverer は、知らせごとに渡すコマンドを起動して渡す
type commandDeliverer struct{ args []string }

func (c commandDeliverer) deliver(w wakeOut) string {
	ctx, cancel := context.WithTimeout(context.Background(), deliverTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, c.args[0], c.args[1:]...)
	cmd.Env = append(os.Environ(), "MATOMEZU_SESSION="+w.Session, "MATOMEZU_WAKE_ID="+w.ID)
	cmd.Stdin = strings.NewReader(w.Text)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	var exit *exec.ExitError
	switch {
	case err == nil:
		return deliverDelivered
	case errors.As(err, &exit) && exit.ExitCode() == deliverAbsentExit:
		return deliverAbsent
	default:
		return deliverFailed
	}
}

func (commandDeliverer) close() {}

// residentDeliverer は、渡すコマンドを立てたままにして、1 行の JSON でやり取りする。止まっていれば次の知らせのときに起動し直す
type residentDeliverer struct {
	args    []string
	cmd     *exec.Cmd
	in      io.WriteCloser
	answers chan string
}

func (r *residentDeliverer) start() error {
	cmd := exec.Command(r.args[0], r.args[1:]...)
	in, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	answers := make(chan string)
	go func() {
		scan := bufio.NewScanner(out)
		for scan.Scan() {
			answers <- scan.Text()
		}
		close(answers)
	}()
	r.cmd, r.in, r.answers = cmd, in, answers
	return nil
}

func (r *residentDeliverer) deliver(w wakeOut) string {
	if r.cmd == nil {
		if err := r.start(); err != nil {
			return deliverFailed
		}
	}
	line, _ := json.Marshal(map[string]string{"id": w.ID, "session": w.Session, "text": w.Text})
	if _, err := r.in.Write(append(line, '\n')); err != nil {
		r.close()
		return deliverFailed
	}
	deadline := time.After(deliverTimeout)
	for {
		select {
		case answer, ok := <-r.answers:
			if !ok {
				r.close()
				return deliverFailed
			}
			var got struct{ ID, Result string }
			if json.Unmarshal([]byte(answer), &got) != nil || got.ID != w.ID {
				continue
			}
			switch got.Result {
			case deliverDelivered, deliverAbsent:
				return got.Result
			default:
				return deliverFailed
			}
		case <-deadline:
			r.close()
			return deliverFailed
		}
	}
}

func (r *residentDeliverer) close() {
	if r.cmd == nil {
		return
	}
	_ = r.in.Close()
	_ = r.cmd.Process.Kill()
	_ = r.cmd.Wait()
	r.cmd = nil
}
