// Package home は matomezu 保管庫フォルダ（利用者ごとに 1 つ）を扱う。
//
// フォルダには、常駐が 1 つだけ立つための鍵（server.lock）と、立っている常駐のつなぎ方（server.json）と、利用者が選んだ常駐のポート（port.json）と、画面と画面 cookie を持つブラウザの鍵のハッシュ（cookies.json）を置く。
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
	"time"

	"github.com/gofrs/flock"
)

// EnvHome は matomezu 保管庫フォルダを指定する環境変数。テストと開発で、利用者が使っている matomezu 保管庫フォルダに触らないために使う
const EnvHome = "MATOMEZU_HOME"

const (
	lockName     = "server.lock"
	serverName   = "server.json"
	portName     = "port.json"
	hostPortName = "host-port.json"
	cookiesName  = "cookies.json"
)

// Dir は matomezu 保管庫フォルダの場所。EnvHome があればそれ、無ければどの OS でもホームの下の .matomezu。
// Windows で AppData の下に置かないのは、MSIX のパッケージの中（Claude Desktop の Code タブ）から起動されると、AppData の下に新しく作る物がそのパッケージだけの場所（%LOCALAPPDATA%\Packages\<パッケージ>\LocalCache）へ付け替わり、利用者が外で打つ matomezu と別の保管庫になるため（Microsoft Learn「Understanding how packaged desktop apps run on Windows」）。
func Dir() (string, error) {
	if d := os.Getenv(EnvHome); d != "" {
		return filepath.Abs(d)
	}
	h, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".matomezu"), nil
}

// Home は、作った（あれば開いた）matomezu 保管庫フォルダ
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

// ReadPort は、利用者が選んだ常駐のポート（port.json）。選んでいなければ 0
func (h *Home) ReadPort() (int, error) {
	return h.readPort(portName)
}

// WritePort は、利用者が選んだ常駐のポートを port.json に書く（このあと立てる常駐は、選び直すまでこのポートで待つ）
func (h *Home) WritePort(port int) error {
	return h.writePort(portName, port)
}

// ReadHostPort は、ホストどうしの入口のポート（host-port.json。初めて開いたときに空いている番号を取って覚えた物）。覚えていなければ 0
func (h *Home) ReadHostPort() (int, error) {
	return h.readPort(hostPortName)
}

// WriteHostPort は、ホストどうしの入口のポートを覚える
func (h *Home) WriteHostPort(port int) error {
	return h.writePort(hostPortName, port)
}

// HostKeyPath は、このホストの秘密鍵のファイル（ホスト id はこの鍵から決まる）
func (h *Home) HostKeyPath() string {
	return filepath.Join(h.Dir, "host.key")
}

func (h *Home) readPort(name string) (int, error) {
	b, err := os.ReadFile(filepath.Join(h.Dir, name))
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	var p struct {
		Port int `json:"port"`
	}
	if err := json.Unmarshal(b, &p); err != nil {
		return 0, fmt.Errorf("%s: %w", name, err)
	}
	return p.Port, nil
}

func (h *Home) writePort(name string, port int) error {
	b, err := json.Marshal(struct {
		Port int `json:"port"`
	}{port})
	if err != nil {
		return err
	}
	tmp := filepath.Join(h.Dir, name+".tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(h.Dir, name))
}

// RemoveServer は server.json を消す（常駐が止まるとき）
func (h *Home) RemoveServer() error {
	err := os.Remove(filepath.Join(h.Dir, serverName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}

// DataPath は、ブックと設定を置くデータベースのファイル
func (h *Home) DataPath() string {
	return filepath.Join(h.Dir, "data.db")
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

// CookieKey は、画面と画面 cookie を持つブラウザの鍵のハッシュと、最後に使った時刻
type CookieKey struct {
	Hash string    `json:"hash"`
	Used time.Time `json:"used"`
}

// ReadCookieKeys は cookies.json を読む。無ければ空
func (h *Home) ReadCookieKeys() ([]CookieKey, error) {
	b, err := os.ReadFile(filepath.Join(h.Dir, cookiesName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var keys []CookieKey
	if err := json.Unmarshal(b, &keys); err != nil {
		return nil, fmt.Errorf("%s: %w", cookiesName, err)
	}
	return keys, nil
}

// WriteCookieKeys は cookies.json を本人だけが読める権限で書く（WriteServer と同じく、別名に書いてから置き換える）
func (h *Home) WriteCookieKeys(keys []CookieKey) error {
	b, err := json.MarshalIndent(keys, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(h.Dir, cookiesName+".tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(h.Dir, cookiesName))
}
