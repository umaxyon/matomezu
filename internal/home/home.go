// Package home は matomezu のアプリのフォルダ（利用者ごとに 1 つ）を扱う。
//
// フォルダには、常駐が 1 つだけ立つための鍵（server.lock）と、立っている常駐のつなぎ方（server.json）を置く。
// 図のデータもこのフォルダに置く。
package home

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"

	"github.com/gofrs/flock"
)

// EnvHome はアプリのフォルダを指定する環境変数。テストと開発で、利用者のフォルダに触らないために使う
const EnvHome = "MATOMEZU_HOME"

const (
	lockName   = "server.lock"
	serverName = "server.json"
)

// Dir はアプリのフォルダの場所。EnvHome があればそれ、無ければ OS ごとのデータの置き場所の下の matomezu
func Dir() (string, error) {
	if d := os.Getenv(EnvHome); d != "" {
		return filepath.Abs(d)
	}
	switch runtime.GOOS {
	case "windows":
		if d := os.Getenv("LOCALAPPDATA"); d != "" {
			return filepath.Join(d, "matomezu"), nil
		}
	case "darwin":
		d, err := os.UserConfigDir() // ~/Library/Application Support
		if err != nil {
			return "", err
		}
		return filepath.Join(d, "matomezu"), nil
	default:
		if d := os.Getenv("XDG_DATA_HOME"); d != "" {
			return filepath.Join(d, "matomezu"), nil
		}
	}
	h, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".local", "share", "matomezu"), nil
}

// Home は、作った（あれば開いた）アプリのフォルダ
type Home struct {
	Dir string
}

// Open はフォルダを本人だけが読み書きできる権限で作り（あればそのまま）、開く
func Open(dir string) (*Home, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &Home{Dir: dir}, nil
}

// ErrRunning は、常駐がすでに立っていること
var ErrRunning = errors.New("the matomezu server is already running")

// Lock は常駐の鍵を取る。取れなければ ErrRunning。常駐が止まるまで持ち、止まるときに Unlock する
func (h *Home) Lock() (*flock.Flock, error) {
	l := flock.New(filepath.Join(h.Dir, lockName))
	ok, err := l.TryLock()
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrRunning
	}
	return l, nil
}

// Running は、鍵を持つ常駐が立っているか（鍵を取れなければ立っている）
func (h *Home) Running() (bool, error) {
	l := flock.New(filepath.Join(h.Dir, lockName))
	ok, err := l.TryLock()
	if err != nil {
		return false, err
	}
	if ok {
		return false, l.Unlock()
	}
	return true, nil
}

// Server は立っている常駐のつなぎ方。合言葉を知る者だけが、常駐を止めるなどの操作をできる
type Server struct {
	URL     string `json:"url"`
	Token   string `json:"token"`
	PID     int    `json:"pid"`
	Version string `json:"version"`
}

// WriteServer は server.json を本人だけが読める権限で書く（書きかけを読ませないよう、別名に書いてから置き換える）
func (h *Home) WriteServer(s Server) error {
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(h.Dir, serverName+".tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(h.Dir, serverName))
}

// ReadServer は server.json を読む。無ければ nil。鍵が空いていれば、残っているのは止まった常駐のもの
func (h *Home) ReadServer() (*Server, error) {
	b, err := os.ReadFile(filepath.Join(h.Dir, serverName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var s Server
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, fmt.Errorf("%s: %w", serverName, err)
	}
	return &s, nil
}

// RemoveServer は server.json を消す（常駐が止まるとき）
func (h *Home) RemoveServer() error {
	err := os.Remove(filepath.Join(h.Dir, serverName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}

// LogPath は、裏で立てた常駐が出力を書くファイル
func (h *Home) LogPath() string {
	return filepath.Join(h.Dir, "server.log")
}

// NewToken は常駐ごとの合言葉を作る
func NewToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
