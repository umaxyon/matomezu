package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
//	GET  api/data    ファイルの中身。ETag に版（中身のハッシュ）、X-Matomezu-Name にファイル名を入れる
//	PUT  api/data    画面からの保存。If-Match の版が今のファイルと違えば 409 を返す
//	GET  api/events  SSE。ファイルの版が変わるたびに version イベントを送る
//
// ファイルの変更は、画面がつながっているあいだ一定間隔で読み直し、中身のハッシュを比べて見つける。
// inotify は WSL の /mnt/c などで Windows 側からの変更を拾えないため使わない。
type doc struct {
	id       string
	path     string
	interval time.Duration
	onConn   func(delta int) // 画面の接続数が変わったときに Hub へ知らせる

	mu      sync.Mutex
	version string
	clients map[chan string]struct{}
}

// ファイルの絶対パスから、URL に使う id を作る。同じファイルなら毎回同じ URL になる
func docID(path string) string {
	sum := sha256.Sum256([]byte(path))
	return hex.EncodeToString(sum[:6])
}

// newDoc は path のファイルを扱う。ファイルが無ければ空の図で作る。
func newDoc(path string, interval time.Duration, onConn func(int)) (*doc, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	d := &doc{id: docID(abs), path: abs, interval: interval, onConn: onConn, clients: map[chan string]struct{}{}}
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

// 今つながっている画面の数
func (d *doc) connections() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.clients)
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

func (d *doc) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")

	ch := make(chan string, 1)
	d.mu.Lock()
	d.clients[ch] = struct{}{}
	v := d.version
	d.mu.Unlock()
	d.onConn(1)
	defer func() {
		d.mu.Lock()
		delete(d.clients, ch)
		d.mu.Unlock()
		d.onConn(-1)
	}()

	// 接続した時点の版を送る。再接続のあいだに変わっていれば、画面はこれで気づける
	send := func(v string) bool {
		_, err := fmt.Fprintf(w, "event: version\ndata: %s\n\n", v)
		flusher.Flush()
		return err == nil
	}
	if !send(v) {
		return
	}
	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case v := <-ch:
			if !send(v) {
				return
			}
		case <-ping.C:
			if _, err := io.WriteString(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// setVersion は版を更新し、変わっていれば SSE で知らせる。d.mu を持った状態で呼ぶ
func (d *doc) setVersion(v string) {
	if v == d.version {
		return
	}
	d.version = v
	for ch := range d.clients {
		select {
		case <-ch: // 送り損ねた古い版は捨て、最新だけを残す
		default:
		}
		ch <- v
	}
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
			if d.connections() == 0 {
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
