// Package server は1つの図の JSON ファイルを、画面と LLM の間で同期させる。
//
//	GET  /api/data    ファイルの中身。ETag に版（中身のハッシュ）、X-Matomezu-Name にファイル名を入れる
//	PUT  /api/data    画面からの保存。If-Match の版が今のファイルと違えば 409 を返す
//	GET  /api/events  SSE。ファイルの版が変わるたびに version イベントを送る
//
// ファイルの変更は、一定間隔で読み直して中身のハッシュを比べて見つける。
// inotify は WSL の /mnt/c などで Windows 側からの変更を拾えないため使わない。
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
	"net"
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

type Server struct {
	path     string
	web      fs.FS
	interval time.Duration

	mu      sync.Mutex
	version string
	clients map[chan string]struct{}
}

type Option func(*Server)

// WithInterval はファイルを読み直す間隔を変える（既定 300ms）。
func WithInterval(d time.Duration) Option { return func(s *Server) { s.interval = d } }

// New は path のファイルを扱うサーバーを作る。ファイルが無ければ空の図で作る。
func New(path string, web fs.FS, opts ...Option) (*Server, error) {
	s := &Server{path: path, web: web, interval: 300 * time.Millisecond, clients: map[chan string]struct{}{}}
	for _, o := range opts {
		o(s)
	}
	b, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		b = []byte(emptyDiagram)
		if err = writeAtomic(path, b); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	s.version = hash(b)
	return s, nil
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

// Handler は API と画面の配信をまとめたもの。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/data", s.getData)
	mux.HandleFunc("PUT /api/data", s.putData)
	mux.HandleFunc("GET /api/events", s.events)
	mux.Handle("GET /", http.FileServerFS(s.web))
	return localOnly(mux)
}

// localhost 以外の Host で来たリクエストを断る（DNS rebinding で外部のページから操作されるのを防ぐ）
func localOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil {
			host = r.Host
		}
		if host != "localhost" && host != "127.0.0.1" && host != "::1" {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) getData(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	b, err := os.ReadFile(s.path)
	if err == nil {
		s.setVersion(hash(b))
	}
	v := s.version
	s.mu.Unlock()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("ETag", quote(v))
	w.Header().Set("X-Matomezu-Name", url.PathEscape(filepath.Base(s.path)))
	w.Write(b)
}

func (s *Server) putData(w http.ResponseWriter, r *http.Request) {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
		return
	}
	if !json.Valid(b) {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	cur, err := os.ReadFile(s.path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// 画面が読んだあとにファイルが書き換えられていたら、上書きせずに知らせる
	if m := r.Header.Get("If-Match"); m != "" && unquote(m) != hash(cur) {
		s.setVersion(hash(cur))
		w.Header().Set("ETag", quote(s.version))
		http.Error(w, "file changed", http.StatusConflict)
		return
	}
	if err := writeAtomic(s.path, b); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.setVersion(hash(b))
	w.Header().Set("ETag", quote(s.version))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")

	ch := make(chan string, 1)
	s.mu.Lock()
	s.clients[ch] = struct{}{}
	v := s.version
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.clients, ch)
		s.mu.Unlock()
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

// setVersion は版を更新し、変わっていれば SSE で知らせる。s.mu を持った状態で呼ぶ
func (s *Server) setVersion(v string) {
	if v == s.version {
		return
	}
	s.version = v
	for ch := range s.clients {
		select {
		case <-ch: // 送り損ねた古い版は捨て、最新だけを残す
		default:
		}
		ch <- v
	}
}

// Watch はファイルを一定間隔で読み直し、外部での変更を知らせる。ctx が終わるまで戻らない
func (s *Server) Watch(ctx context.Context) {
	t := time.NewTicker(s.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			b, err := os.ReadFile(s.path)
			if err != nil {
				continue // 置き換えの途中などで一瞬読めないことがある
			}
			s.mu.Lock()
			s.setVersion(hash(b))
			s.mu.Unlock()
		}
	}
}

func quote(v string) string   { return `"` + v + `"` }
func unquote(v string) string { return strings.Trim(strings.TrimPrefix(v, "W/"), `"`) }
