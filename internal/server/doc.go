package server

import (
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
)

// 新しいファイルを作るときの中身
const emptyDiagram = "{\n  \"nodes\": [],\n  \"edges\": []\n}\n"

// 保存を受け付ける最大の大きさ
const maxBody = 16 << 20

// doc は1つの図の JSON ファイルを、画面と LLM の間で同期させる。
//
//	GET  api/data    ファイルの中身。ETag に版（中身のハッシュ）、X-Matomezu-Name にファイル名を入れる
//	PUT  api/data    画面からの保存。If-Match の版が今のファイルと違えば 409 を返す
//	POST api/layout  画面からの配置の要約 {"version", "page", "summary", "details"}。ページごとに最新の1件だけを覚える
//	GET  api/layout  ?page=<id> のページ（無ければ最初のページ）の要約と、今のファイルの版 {"version", "page", "summary", "current"}
//
// 版の変更は Hub の通知（hub.go の /api/events）で画面へ知らせる。
// ファイルの変更は、画面が開いているあいだ Hub が一定間隔で読み直し（poll）、中身のハッシュを比べて見つける。
// inotify は WSL の /mnt/c などで Windows 側からの変更を拾えないため使わない。
type doc struct {
	id        string
	path      string
	onVersion func(id, version string) // 版が変わったときに Hub へ知らせる

	mu      sync.Mutex
	version string
	layout  map[string]Layout // 画面から届いた最新の配置の要約（ページの箱の id ごと。最初のページは ""）
}

// Layout は画面が配置した結果の要約。Version はそのとき画面が表示していたファイルの版、Page は描いていたページ。
// Details は子のある箱ごとの、子の位置と大きさ（箱の id ごとに 1 行。matomezu check / set の -in で出す）
type Layout struct {
	Version string            `json:"version"`
	Page    string            `json:"page"`
	Summary string            `json:"summary"`
	Details map[string]string `json:"details,omitempty"`
}

// ファイルの絶対パスから、URL に使う id を作る。同じファイルなら毎回同じ URL になる
func docID(path string) string {
	sum := sha256.Sum256([]byte(path))
	return hex.EncodeToString(sum[:6])
}

// newDoc は abs（絶対パス）のファイルを扱う。ファイルが無ければ空の図で作る。
func newDoc(abs string, onVersion func(id, version string)) (*doc, error) {
	d := &doc{id: docID(abs), path: abs, onVersion: onVersion, layout: map[string]Layout{}}
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

// ensureFile は、ファイルが消えていれば空の図で作り直す（登録済みの図を開き直したとき）
func (d *doc) ensureFile() error {
	if _, err := os.Stat(d.path); !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	b := []byte(emptyDiagram)
	if err := writeAtomic(d.path, b); err != nil {
		return err
	}
	d.setVersion(hash(b))
	return nil
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
	d.layout[l.Page] = l
	d.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (d *doc) getLayout(w http.ResponseWriter, r *http.Request) {
	b, err := os.ReadFile(d.path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	page := r.URL.Query().Get("page")
	d.mu.Lock()
	l, ok := d.layout[page]
	d.mu.Unlock()
	if !ok {
		l = Layout{Page: page}
	}
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

// poll はファイルを読み直し、外部で変わっていれば知らせる（Hub の監視が一定間隔で呼ぶ）
func (d *doc) poll() {
	b, err := os.ReadFile(d.path)
	if err != nil {
		return // 置き換えの途中などで一瞬読めないことがある
	}
	d.mu.Lock()
	d.setVersion(hash(b))
	d.mu.Unlock()
}

func quote(v string) string   { return `"` + v + `"` }
func unquote(v string) string { return strings.Trim(strings.TrimPrefix(v, "W/"), `"`) }
