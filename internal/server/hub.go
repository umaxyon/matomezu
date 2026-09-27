// Package server は図の JSON ファイルを、画面と LLM の間で同期させる HTTP サーバー。
//
// 1つのサーバーで複数の図を扱う。図ごとの URL は /d/<id>/ で、id はファイルの絶対パスから作る。
//
//	/d/<id>/             画面（埋め込みの web）
//	/d/<id>/api/...      図ごとの API（doc.go を参照）
//	GET  /api/ping       起動確認。{"version", "pid"} を返す            … 要トークン
//	POST /api/open       {"path"} の図を登録し、{"id", "path", "connections"} を返す … 要トークン
//	POST /api/shutdown   サーバーを止める                                … 要トークン
//
// トークンは X-Matomezu-Token ヘッダーで渡す。/api/open は任意のファイルを読み書きさせられる入口なので、
// 本人だけが読める state ファイルにあるトークンを持つプロセスにしか使わせない。
package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io/fs"
	"net"
	"net/http"
	"os"
	"sync"
	"time"
)

type Hub struct {
	ctx      context.Context
	web      http.Handler
	token    string
	version  string
	interval time.Duration
	shutdown func()

	mu        sync.Mutex
	docs      map[string]*doc
	conns     int       // 全部の図の画面の接続数
	idleSince time.Time // conns が 0 になった時刻
}

type Option func(*Hub)

// WithInterval はファイルを読み直す間隔を変える（既定 300ms）。
func WithInterval(d time.Duration) Option { return func(h *Hub) { h.interval = d } }

// WithControl は制御用 API（/api/ping, /api/open, /api/shutdown）を有効にする。
func WithControl(token, version string, shutdown func()) Option {
	return func(h *Hub) { h.token, h.version, h.shutdown = token, version, shutdown }
}

// NewHub は ctx が終わるまでファイルの監視を続ける Hub を作る。
func NewHub(ctx context.Context, web fs.FS, opts ...Option) *Hub {
	h := &Hub{
		ctx:       ctx,
		web:       http.FileServerFS(web),
		interval:  300 * time.Millisecond,
		docs:      map[string]*doc{},
		idleSince: time.Now(),
	}
	for _, o := range opts {
		o(h)
	}
	return h
}

// OpenResult は図を登録した結果。
type OpenResult struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Connections int    `json:"connections"` // すでに開いている画面の数（0 ならブラウザを開く）
}

// Open は path の図を登録する。登録済みならそれを返す。ファイルが無ければ空の図で作る。
func (h *Hub) Open(path string) (OpenResult, error) {
	d, err := newDoc(path, h.interval, h.connChanged)
	if err != nil {
		return OpenResult{}, err
	}
	h.mu.Lock()
	if cur, ok := h.docs[d.id]; ok {
		d = cur
	} else {
		h.docs[d.id] = d
		go d.watch(h.ctx)
	}
	h.idleSince = time.Now() // 開いた直後は、画面がつながるまで待つ
	h.mu.Unlock()
	return OpenResult{ID: d.id, Path: d.path, Connections: d.connections()}, nil
}

func (h *Hub) connChanged(delta int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.conns += delta
	if h.conns == 0 {
		h.idleSince = time.Now()
	}
}

// Idle は画面が1つもつながっていない時間。つながっていれば 0。
func (h *Hub) Idle() time.Duration {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns > 0 {
		return 0
	}
	return time.Since(h.idleSince)
}

func (h *Hub) doc(id string) *doc {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.docs[id]
}

// Handler は API と画面の配信をまとめたもの。
func (h *Hub) Handler() http.Handler {
	mux := http.NewServeMux()
	withDoc := func(fn func(*doc, http.ResponseWriter, *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			d := h.doc(r.PathValue("id"))
			if d == nil {
				http.Error(w, "unknown diagram", http.StatusNotFound)
				return
			}
			fn(d, w, r)
		}
	}
	mux.HandleFunc("GET /d/{id}/api/data", withDoc((*doc).getData))
	mux.HandleFunc("PUT /d/{id}/api/data", withDoc((*doc).putData))
	mux.HandleFunc("GET /d/{id}/api/events", withDoc((*doc).events))
	// 画面は相対パスで API と dist/ を読むので、末尾の / をそろえる
	mux.HandleFunc("GET /d/{id}", withDoc(func(d *doc, w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/d/"+d.id+"/", http.StatusMovedPermanently)
	}))
	mux.HandleFunc("GET /d/{id}/", withDoc(func(d *doc, w http.ResponseWriter, r *http.Request) {
		http.StripPrefix("/d/"+d.id, h.web).ServeHTTP(w, r)
	}))

	if h.token != "" {
		mux.HandleFunc("GET /api/ping", h.control(h.ping))
		mux.HandleFunc("POST /api/open", h.control(h.open))
		mux.HandleFunc("POST /api/shutdown", h.control(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
			go h.shutdown()
		}))
	}
	return localOnly(mux)
}

func (h *Hub) control(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Matomezu-Token")
		if subtle.ConstantTimeCompare([]byte(got), []byte(h.token)) != 1 {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

func (h *Hub) ping(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{"version": h.version, "pid": os.Getpid()})
}

func (h *Hub) open(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	res, err := h.Open(req.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, res)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
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
