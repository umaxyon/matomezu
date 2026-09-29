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

func NewToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ---- 起動中のサーバーへの要求 ----

var client = &http.Client{Timeout: 3 * time.Second}

func call(s *State, method, path string, body any, out any) error {
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
		return fmt.Errorf("%s %s: %s", method, path, bytes.TrimSpace(msg))
	}
	if out != nil {
		return json.NewDecoder(res.Body).Decode(out)
	}
	return nil
}

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

func Shutdown(s *State) error { return call(s, "POST", "/api/shutdown", nil, nil) }

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
// （開いていた画面が同じ URL のままつなぎ直せるようにするため）
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
	}
	s, err = start(ctx, exe, version, args)
	return s, replaced, err
}

func start(ctx context.Context, exe, version string, args []string) (*State, error) {
	dir, err := Dir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	log, err := os.OpenFile(filepath.Join(dir, "daemon.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
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
