// Package daemon は常駐サーバーを1つだけ動かし、ほかのコマンドから使えるようにする。
//
// 起動中のサーバーの情報（アドレス・トークン・pid・版）は、ユーザーのキャッシュフォルダの
// matomezu/server.json に置く。本人だけが読める権限にし、トークンを知る者だけが図を登録できる。
package daemon

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/umaxyon/matomezu/internal/server"
)

type State struct {
	PID     int    `json:"pid"`
	Addr    string `json:"addr"`
	Token   string `json:"token"`
	Version string `json:"version"`
}

func (s *State) URL(path string) string { return "http://" + s.Addr + path }

// Dir は状態ファイルとログを置くフォルダ。MATOMEZU_HOME で変えられる（テスト用）
func Dir() (string, error) {
	if d := os.Getenv("MATOMEZU_HOME"); d != "" {
		return d, nil
	}
	c, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(c, "matomezu"), nil
}

func statePath() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "server.json"), nil
}

// ReadState は状態ファイルを読む。無ければ nil を返す
func ReadState() (*State, error) {
	p, err := statePath()
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	var s State
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, nil // 壊れていれば無いものとして作り直す
	}
	return &s, nil
}

// WriteState は状態ファイルを本人だけが読める権限で書く
func WriteState(s *State) error {
	p, err := statePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	tmp := p + fmt.Sprintf(".%d.tmp", os.Getpid())
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// RemoveState は状態ファイルが pid のものであれば消す（あとから起動した別のサーバーの分は消さない）
func RemoveState(pid int) {
	s, _ := ReadState()
	if s == nil || s.PID != pid {
		return
	}
	if p, err := statePath(); err == nil {
		os.Remove(p)
	}
}

// Last は最後に動いたサーバーのアドレスと、止まるときに画面がつながっていたか。止めたあとの次の起動で同じアドレスを使い、
// 開いたままの画面がつなぎ直せるようにする（使い直さないと、前の画面は「再接続中…」のまま残り、新しいタブが増える）
type Last struct {
	Addr  string `json:"addr"`
	Pages bool   `json:"pages"`
}

func lastPath() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "last.json"), nil
}

// WriteLast は最後に動いたサーバーを書く（状態ファイルと違い、止まっても消さない）
func WriteLast(l Last) error {
	p, err := lastPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	b, _ := json.Marshal(l)
	return os.WriteFile(p, b, 0o600)
}

// ReadLast は最後に動いたサーバーを読む。無いか壊れていれば nil
func ReadLast() *Last {
	p, err := lastPath()
	if err != nil {
		return nil
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return nil
	}
	var l Last
	if json.Unmarshal(b, &l) != nil || l.Addr == "" {
		return nil
	}
	return &l
}

func NewToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ---- 起動中のサーバーへの要求 ----

var client = &http.Client{Timeout: 3 * time.Second}

// slowClient は画面の答えを待つ頼みごと（要約。サーバーの summaryWait より長く）
var slowClient = &http.Client{Timeout: 20 * time.Second}

func call(s *State, method, path string, body any, out any) error {
	return callWith(client, s, method, path, body, out)
}

func callWith(client *http.Client, s *State, method, path string, body any, out any) error {
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, s.URL(path), r)
	if err != nil {
		return err
	}
	req.Header.Set("X-Matomezu-Token", s.Token)
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		msg, _ := io.ReadAll(res.Body)
		return &serverError{fmt.Sprintf("%s %s: %s", method, path, bytes.TrimSpace(msg)), string(bytes.TrimSpace(msg))}
	}
	if out != nil {
		return json.NewDecoder(res.Body).Decode(out)
	}
	return nil
}

// serverError はサーバーが断った頼みごと（msg はサーバーの言葉だけ）
type serverError struct{ full, msg string }

func (e *serverError) Error() string { return e.full }

// Ping は起動中のサーバーの版を返す。応答が無ければエラー
func Ping(s *State) (string, error) {
	var res struct {
		Version string `json:"version"`
		PID     int    `json:"pid"`
	}
	if err := call(s, "GET", "/api/ping", nil, &res); err != nil {
		return "", err
	}
	if res.PID != s.PID {
		return "", errors.New("state file does not match the running server")
	}
	return res.Version, nil
}

// Open は path の図をサーバーに登録する。相対パスはサーバーの作業フォルダではなく、呼んだ側の作業フォルダから解決する。
// show なら、つながっている画面にその図（page があればそのページ）を開くよう知らせる
func Open(s *State, path string, show bool, page string) (server.OpenResult, error) {
	var res server.OpenResult
	abs, err := filepath.Abs(path)
	if err != nil {
		return res, err
	}
	err = call(s, "POST", "/api/open", map[string]any{"path": abs, "show": show, "page": page}, &res)
	return res, err
}

// Ask は path の図を登録し、画面には郵便箱に入れて「届いています」と聞くよう知らせる（matomezu open。D26 の段階 3）
func Ask(s *State, path string, page string) (server.OpenResult, error) {
	var res server.OpenResult
	abs, err := filepath.Abs(path)
	if err != nil {
		return res, err
	}
	err = call(s, "POST", "/api/open", map[string]any{"path": abs, "show": true, "page": page, "ask": true}, &res)
	return res, err
}

// Summary は path の図の page（"" は最初のページ）の配置の要約を、カレントの画面に頼んで返す（matomezu check。D30）。
// 画面は前に出さない。誤りはサーバーの言葉だけを返す
func Summary(s *State, path, page string) (server.Layout, error) {
	var l server.Layout
	abs, err := filepath.Abs(path)
	if err != nil {
		return l, err
	}
	err = callWith(slowClient, s, "POST", "/api/summary", map[string]any{"path": abs, "page": page}, &l)
	var se *serverError
	if errors.As(err, &se) {
		return l, errors.New(se.msg)
	}
	return l, err
}

// Fit は path の図を data に書き換えたら紙に収まるかを、カレントの画面に頼んで返す（新しくはみ出す箱。D33）。誤りはサーバーの言葉だけを返す
func Fit(s *State, path string, data []byte) ([]server.FitOver, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	var out struct {
		Over []server.FitOver `json:"over"`
	}
	err = callWith(slowClient, s, "POST", "/api/fit", map[string]any{"path": abs, "data": json.RawMessage(data)}, &out)
	var se *serverError
	if errors.As(err, &se) {
		return nil, errors.New(se.msg)
	}
	return out.Over, err
}

// Notify はカレントの画面に通知を送る（matomezu notify。D30）。path があればその図を開く動きを持つ。誤りはサーバーの言葉だけを返す
func Notify(s *State, n server.NotifyRequest) error {
	if n.Path != "" {
		abs, err := filepath.Abs(n.Path)
		if err != nil {
			return err
		}
		n.Path = abs
	}
	err := call(s, "POST", "/api/notify", n, nil)
	var se *serverError
	if errors.As(err, &se) {
		return errors.New(se.msg)
	}
	return err
}

// Close は path の図のタブを閉じるよう、サーバーにつながっている画面に知らせる（登録は残る）
func Close(s *State, path string) (server.CloseResult, error) {
	var res server.CloseResult
	abs, err := filepath.Abs(path)
	if err != nil {
		return res, err
	}
	err = call(s, "POST", "/api/close", map[string]any{"path": abs}, &res)
	return res, err
}

func Shutdown(s *State) error { return call(s, "POST", "/api/shutdown", nil, nil) }

// LLMHistory は図 id の LLM の履歴（D31。server/llmhist.go）
func LLMHistory(s *State, id string) ([]server.LLMEntry, error) {
	var res struct {
		Entries []server.LLMEntry `json:"entries"`
	}
	err := call(s, "GET", "/d/"+id+"/api/llm", nil, &res)
	return res.Entries, err
}

// Revert は図 id の LLM の履歴の n 番を取り消す
func Revert(s *State, id string, n int) error {
	return call(s, "POST", "/d/"+id+"/api/llm/"+strconv.Itoa(n)+"/revert", map[string]any{}, nil)
}

// Running は応答するサーバーがあればその状態を返す。無ければ nil
func Running() *State {
	s, _ := ReadState()
	if s == nil {
		return nil
	}
	if _, err := Ping(s); err != nil {
		return nil
	}
	return s
}

// Ensure は version のサーバーが動いていればそれを返し、無ければ exe daemon を切り離して起動する。
// 違う版のサーバーが動いていれば止めてから起動し直す。そのときは同じアドレスで起動を試し、replaced を true で返す
// （開いていた画面が同じ URL のままつなぎ直せるようにするため）。
// 止まっていれば、最後に動いたサーバーのアドレスで起動を試す。止まるときに画面がつながっていたら、replaced を true で返す
func Ensure(ctx context.Context, exe, version string) (s *State, replaced bool, err error) {
	var args []string
	if s := Running(); s != nil {
		if v, _ := Ping(s); v == version {
			return s, false, nil
		}
		Shutdown(s)
		waitGone(s)
		replaced = true
		args = append(args, "-addr", s.Addr)
	} else if l := ReadLast(); l != nil {
		replaced = l.Pages
		args = append(args, "-addr", l.Addr)
	}
	s, err = start(ctx, exe, version, args)
	return s, replaced, err
}

// logLimit はログの大きさの上限。起動するたびに、越えていれば新しい方の半分だけ残す（伸び続けないように）
const logLimit = 64 << 10

// trimLog は path のログが limit を越えていれば、末尾の limit/2 ほど（行の頭から）だけ残す
func trimLog(path string, limit int64) {
	st, err := os.Stat(path)
	if err != nil || st.Size() <= limit {
		return
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	tail := b[int64(len(b))-limit/2:]
	if i := bytes.IndexByte(tail, '\n'); i >= 0 {
		tail = tail[i+1:]
	}
	_ = os.WriteFile(path, tail, 0o600)
}

func start(ctx context.Context, exe, version string, args []string) (*State, error) {
	dir, err := Dir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	logPath := filepath.Join(dir, "daemon.log")
	trimLog(logPath, logLimit)
	log, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, err
	}
	defer log.Close()
	cmd := exec.Command(exe, append([]string{"daemon"}, args...)...)
	cmd.Stdout, cmd.Stderr = log, log
	detach(cmd)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	pid := cmd.Process.Pid
	cmd.Process.Release()

	// 起動して状態ファイルを書くまで待つ。同時に起動された別のサーバーが先に書いたら、そちらを使う
	// （自分が起動した分は、状態ファイルに載っていないことに気づいて自分で止まる）
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	for {
		if s := Running(); s != nil && (s.PID == pid || s.Version == version) {
			return s, nil
		}
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("server did not start (see %s)", filepath.Join(dir, "daemon.log"))
		case <-time.After(50 * time.Millisecond):
		}
	}
}

func waitGone(s *State) {
	for i := 0; i < 100; i++ {
		if _, err := Ping(s); err != nil {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}
