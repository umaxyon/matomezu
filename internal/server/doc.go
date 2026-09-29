package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// 新しいファイルを作るときの中身
const emptyDiagram = "{\n  \"nodes\": [],\n  \"edges\": []\n}\n"

// 保存を受け付ける最大の大きさ
const maxBody = 16 << 20

// doc は1つの図の JSON ファイルを、画面と LLM の間で同期させる。
//
//	GET  api/data    ファイルの中身。ETag に版（中身のハッシュ）、X-Matomezu-Name にファイル名、
//	                 X-Matomezu-Server にサーバーの版を入れる
//	PUT  api/data    画面からの保存。If-Match の版が今のファイルと違えば 409 を返す
//	POST api/layout  画面からの配置の要約 {"version", "summary"}。最新の1件だけを覚える
//	GET  api/layout  覚えている配置の要約と、今のファイルの版 {"version", "summary", "current"}
//
// 版の変更は Hub の通知（hub.go の /api/events）で画面へ知らせる。
// ファイルの変更は、画面がつながっているあいだ一定間隔で読み直し、中身のハッシュを比べて見つける。
// inotify は WSL の /mnt/c などで Windows 側からの変更を拾えないため使わない。
type doc struct {
	id        string
	path      string
	server    string // サーバーの版
	interval  time.Duration
	onVersion func(id, version string) // 版が変わったときに Hub へ知らせる
	active    func() bool              // 画面がつながっているか（つながっていなければ読み直さない）

	mu      sync.Mutex
	version string
	layout  Layout // 画面から届いた最新の配置の要約
}

// Layout は画面が配置した結果の要約。Version はそのとき画面が表示していたファイルの版
type Layout struct {
	Version string `json:"version"`
	Summary string `json:"summary"`
}

// ファイルの絶対パスから、URL に使う id を作る。同じファイルなら毎回同じ URL になる
func docID(path string) string {
	sum := sha256.Sum256([]byte(path))
	return hex.EncodeToString(sum[:6])
}

// newDoc は path のファイルを扱う。ファイルが無ければ空の図で作る。
func newDoc(path, server string, interval time.Duration, onVersion func(id, version string), active func() bool) (*doc, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	d := &doc{id: docID(abs), path: abs, server: server, interval: interval, onVersion: onVersion, active: active}
	b, err := os.ReadFile(abs)
	if errors.Is(err, fs.ErrNotExist) {
		b = []byte(emptyDiagram)
		if err = writeAtomic(abs, b); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	d.version = hash(b)
	return d, nil
}

func hash(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:8])
}

// 同じフォルダに一時ファイルを書いてから置き換える。書きかけの中身を読まれないようにするため
func writeAtomic(path string, b []byte) error {
	mode := fs.FileMode(0o644)
	if st, err := os.Stat(path); err == nil {
		mode = st.Mode().Perm()
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // rename できたときは何もしない
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), mode); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// 今の版
func (d *doc) currentVersion() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.version
}

func (d *doc) getData(w http.ResponseWriter, _ *http.Request) {
	d.mu.Lock()
	b, err := os.ReadFile(d.path)
	if err == nil {
		d.setVersion(hash(b))
	}
	v := d.version
	d.mu.Unlock()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("ETag", quote(v))
	w.Header().Set("X-Matomezu-Name", url.PathEscape(filepath.Base(d.path)))
	w.Header().Set("X-Matomezu-Server", d.server)
	w.Write(b)
}

func (d *doc) putData(w http.ResponseWriter, r *http.Request) {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
		return
	}
	if !json.Valid(b) {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	cur, err := os.ReadFile(d.path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// 画面が読んだあとにファイルが書き換えられていたら、上書きせずに知らせる
	if m := r.Header.Get("If-Match"); m != "" && unquote(m) != hash(cur) {
		d.setVersion(hash(cur))
		w.Header().Set("ETag", quote(d.version))
		http.Error(w, "file changed", http.StatusConflict)
		return
	}
	if err := writeAtomic(d.path, b); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	d.setVersion(hash(b))
	w.Header().Set("ETag", quote(d.version))
	w.WriteHeader(http.StatusNoContent)
}

func (d *doc) putLayout(w http.ResponseWriter, r *http.Request) {
	var l Layout
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&l); err != nil || l.Version == "" {
		http.Error(w, "version required", http.StatusBadRequest)
		return
	}
	d.mu.Lock()
	d.layout = l
	d.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (d *doc) getLayout(w http.ResponseWriter, _ *http.Request) {
	b, err := os.ReadFile(d.path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	d.mu.Lock()
	l := d.layout
	d.mu.Unlock()
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, struct {
		Layout
		Current string `json:"current"`
	}{l, hash(b)})
}

// setVersion は版を更新し、変わっていれば Hub へ知らせる。d.mu を持った状態で呼ぶ
func (d *doc) setVersion(v string) {
	if v == d.version {
		return
	}
	d.version = v
	d.onVersion(d.id, v)
}

// watch はファイルを一定間隔で読み直し、外部での変更を知らせる。ctx が終わるまで戻らない。
// 画面がつながっていないあいだは、知らせる相手がいないので読まない
func (d *doc) watch(ctx context.Context) {
	t := time.NewTicker(d.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if !d.active() {
				continue
			}
			b, err := os.ReadFile(d.path)
			if err != nil {
				continue // 置き換えの途中などで一瞬読めないことがある
			}
			d.mu.Lock()
			d.setVersion(hash(b))
			d.mu.Unlock()
		}
	}
}

func quote(v string) string   { return `"` + v + `"` }
func unquote(v string) string { return strings.Trim(strings.TrimPrefix(v, "W/"), `"`) }
