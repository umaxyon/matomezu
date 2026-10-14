// Package server は図の JSON ファイルを、画面と LLM の間で同期させる HTTP サーバー。
//
// 1つのサーバーで複数の図を扱う。画面は1つ（/）で、図はその中のタブとして開く。
// 図の id はファイルの絶対パスから作る。
//
//	/                    画面（埋め込みの web）。?d=<id> で開く図を指定する
//	/d/<id>/             /?d=<id> へ転送する（以前の URL）
//	/d/<id>/api/...      図ごとの API（doc.go を参照）
//	GET  /api/events     SSE。全部の図の通知を1本で送る（下を参照）
//	GET  /api/info       {"server"} サーバーの版。画面が matomezu のサーバーから開かれたかを知るのに使う
//	POST /api/watch      {"client", "docs"} その画面が開いている図（タブ）。監視するのは、どれかの画面が開いている図だけ
//	POST /api/new        {"near", "title", "world"} 画面から新しいブックを作って登録し、{"id", "path"} を返す（newbook.go）
//	GET  /api/books      登録した図を最終更新の新しい順に返す（マスターの一覧。books.go）
//	GET  /api/master     マスター用のファイルを登録して {"id"} を返す（books.go）
//	GET  /api/ping       起動確認。{"version", "pid"} を返す            … 要トークン
//	POST /api/open       {"path", "show", "page"} の図を登録し、{"id", "path", "connections"} を返す … 要トークン
//	                     show なら、つながっている画面にその図（page があればそのページ）を開くよう知らせる
//	POST /api/close      {"path"} の図のタブを閉じるよう、つながっている画面に知らせ、{"id", "connections"} を返す … 要トークン
//	                     登録は残す（あとで open すればすぐ開ける。登録は新しい方から storeLimit 件まで）。登録の無い図は誤り
//	POST /api/shutdown   サーバーを止める                                … 要トークン
//
// /api/events のイベント（data は JSON）:
//
//	server   サーバーの版（文字列）。つないだときに送る。画面は読み込んだときの版と違えば読み直す
//	hello    {"client"} この接続の id。画面は /api/watch で、開いている図をこの id で知らせる
//	version  {"doc", "version"} 図のファイルの版が変わった。つないだときは登録済みの全部の図の分を送る
//	open     {"doc", "page"} その図のページ（page が "" なら最初のページ）を開いて前に出す。つないだときも、少し前に頼まれていれば送る
//	close    {"doc"} その図のタブを閉じる（matomezu close）
//	mail     {"doc"} その図の郵便箱が変わった（mail.go）
//
// 図ごとに SSE をつなぐと、ブラウザの同じサーバーへの同時接続の上限（HTTP/1.1 で 6 本）に当たるので、1本にまとめている。
//
// ファイルの監視（doc.go の poll）は Hub の 1 本の処理で、どれかの画面が開いている図だけを一定間隔で読み直す。
// 開いている図をまだ知らせていない画面は、登録済みの全部の図を開いているとみなす（つないだ直後や、前の版の画面）。
//
// 画面からの書き込み（api/data の PUT、api/layout、api/watch、api/new）は、JSON の本文で、Origin が無いか localhost のものだけを受ける
// （newbook.go の fromPage。ほかのサイトのページから送られたものを断る）。
// トークンは X-Matomezu-Token ヘッダーで渡す。/api/open は任意のファイルを読み書きさせられる入口なので、
// 本人だけが読める state ファイルにあるトークンを持つプロセスにしか使わせない。
//
// 登録した図のパスは、WithStore のファイルに書いておき、次に起動したときに登録し直す（ファイルが消えた図は除く）。
// サーバーが入れ替わったり止まったりしても、画面のタブ（localStorage に覚えている）を開き直せるように。
package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
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
	clients   map[chan event]*client // つながっている画面
	idleSince time.Time              // 画面が 0 になった時刻
	shown     string                 // 最後に開くよう頼まれた図とページ（open イベントの data）
	shownAt   time.Time
	store     string   // 登録した図のパスを書いておくファイル（"" なら書かない）
	recent    []string // 登録した図のパス（古い順。store があれば書く）

	mailMu sync.Mutex // 郵便箱のファイルの読み書き（mail.go）
}

// storeLimit は store に覚えておく図の数（新しいものから）
const storeLimit = 100

// 開くよう頼まれた図を、少しあとにつながった画面にも知らせる時間。
// サーバーを入れ替えた直後は、画面がつなぎ直して読み直すあいだに届いた知らせを取りこぼすため
const showReplay = 5 * time.Second

type event struct {
	name string
	data string
}

// つながっている画面。docs はその画面が開いている図（nil ならまだ知らせが無いので、全部とみなす）
type client struct {
	id   string
	docs map[string]bool
}

type Option func(*Hub)

// WithInterval はファイルを読み直す間隔を変える（既定 300ms）。
func WithInterval(d time.Duration) Option { return func(h *Hub) { h.interval = d } }

// WithControl は制御用 API（/api/ping, /api/open, /api/shutdown）を有効にする。
func WithControl(token, version string, shutdown func()) Option {
	return func(h *Hub) { h.token, h.version, h.shutdown = token, version, shutdown }
}

// WithStore は、登録した図のパスを path に書き、起動したときにそこから登録し直す。
func WithStore(path string) Option { return func(h *Hub) { h.store = path } }

// NewHub は ctx が終わるまでファイルの監視を続ける Hub を作る。
func NewHub(ctx context.Context, web fs.FS, opts ...Option) *Hub {
	h := &Hub{
		ctx:       ctx,
		web:       http.FileServerFS(web),
		interval:  300 * time.Millisecond,
		docs:      map[string]*doc{},
		clients:   map[chan event]*client{},
		idleSince: time.Now(),
	}
	for _, o := range opts {
		o(h)
	}
	h.restore()
	go h.watch()
	return h
}

// restore は store に書いてある図を登録し直す。ファイルが消えた図は登録しない（空の図を作らない）
func (h *Hub) restore() {
	if h.store == "" {
		return
	}
	b, err := os.ReadFile(h.store)
	if err != nil {
		return
	}
	var paths []string
	if json.Unmarshal(b, &paths) != nil {
		return
	}
	for _, p := range paths {
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			continue
		}
		d, err := newDoc(p, h.versionChanged)
		if err != nil {
			continue
		}
		h.docs[d.id] = d
		h.recent = append(h.recent, p)
	}
}

// remember は登録した図のパスを、一番新しいものとして覚え、store に書く（新しいブックの置き場所にも使う。newbook.go）
func (h *Hub) remember(path string) {
	h.mu.Lock()
	out := make([]string, 0, len(h.recent)+1)
	for _, p := range h.recent {
		if p != path {
			out = append(out, p)
		}
	}
	out = append(out, path)
	if len(out) > storeLimit {
		out = out[len(out)-storeLimit:]
	}
	h.recent = out
	h.forget()
	b, _ := json.MarshalIndent(out, "", "  ")
	h.mu.Unlock()
	if h.store == "" {
		return
	}
	// 開いた図のパスの一覧なので、本人だけが読めるようにする（同じフォルダの server.json・daemon.log と同じ）
	if err := os.MkdirAll(filepath.Dir(h.store), 0o700); err == nil && writeAtomic(h.store, b) == nil {
		_ = os.Chmod(h.store, 0o600)
	}
}

// forget は、覚えている図（recent。新しい方から storeLimit 件）から落ちた図の登録を外す。どれかの画面が開いている図は外さない
// （開いている図を知らせていない画面があれば、全部を開いているとみなして外さない）。h.mu を持って呼ぶ
func (h *Hub) forget() {
	keep := map[string]bool{}
	for _, p := range h.recent {
		keep[docID(p)] = true
	}
	for _, c := range h.clients {
		if c.docs == nil {
			return
		}
		for id := range c.docs {
			keep[id] = true
		}
	}
	for id := range h.docs {
		if !keep[id] {
			delete(h.docs, id)
		}
	}
}

// watch は、どれかの画面が開いている図のファイルを一定間隔で読み直し、外部での変更を知らせる。h.ctx が終わるまで戻らない。
// 画面がつながっていないあいだは、知らせる相手がいないので読まない
func (h *Hub) watch() {
	t := time.NewTicker(h.interval)
	defer t.Stop()
	for {
		select {
		case <-h.ctx.Done():
			return
		case <-t.C:
			for _, d := range h.watched() {
				d.poll()
			}
		}
	}
}

// watched は、どれかの画面が開いている図
func (h *Hub) watched() []*doc {
	h.mu.Lock()
	defer h.mu.Unlock()
	open := map[string]bool{}
	for _, c := range h.clients {
		if c.docs == nil {
			for id := range h.docs {
				open[id] = true
			}
			break
		}
		for id := range c.docs {
			open[id] = true
		}
	}
	out := make([]*doc, 0, len(open))
	for id := range open {
		if d := h.docs[id]; d != nil {
			out = append(out, d)
		}
	}
	return out
}

// OpenResult は図を登録した結果。
type OpenResult struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Connections int    `json:"connections"` // つながっている画面の数（0 ならブラウザを開く）
}

// Open は path の図を登録する。登録済みならそれを返す。ファイルが無ければ空の図で作る。
// show なら、つながっている画面にその図を開くよう知らせる
func (h *Hub) Open(path string, show bool, page string) (OpenResult, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return OpenResult{}, err
	}
	// 登録済みなら読み直さない（版は監視と api/data が最新にする）。ファイルが消えていれば、初めて開くときと同じく空の図で作る
	h.mu.Lock()
	d := h.docs[docID(abs)]
	h.mu.Unlock()
	if d != nil {
		if err := d.ensureFile(); err != nil {
			return OpenResult{}, err
		}
	} else {
		nd, err := newDoc(abs, h.versionChanged)
		if err != nil {
			return OpenResult{}, err
		}
		h.mu.Lock()
		if d = h.docs[nd.id]; d == nil {
			d = nd
			h.docs[d.id] = d
		}
		h.mu.Unlock()
	}
	h.remember(d.path)
	h.mu.Lock()
	h.idleSince = time.Now() // 開いた直後は、画面がつながるまで待つ
	conns := len(h.clients)
	opened := jsonString(map[string]string{"doc": d.id, "page": page})
	if show {
		h.shown, h.shownAt = opened, time.Now()
	}
	h.mu.Unlock()
	if show {
		h.broadcast(event{"open", opened})
	}
	return OpenResult{ID: d.id, Path: d.path, Connections: conns}, nil
}

// CloseResult は Close の結果。Connections は知らせた画面の数
type CloseResult struct {
	ID          string `json:"id"`
	Connections int    `json:"connections"`
}

// Close は path の図のタブを閉じるよう、つながっている画面に知らせる。登録は残す（画面の × と同じ）。
// 少し前に頼まれた open が残っていれば消す（つなぎ直した画面が、閉じた図を開き直さないように）
func (h *Hub) Close(path string) (CloseResult, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return CloseResult{}, err
	}
	id := docID(abs)
	h.mu.Lock()
	d := h.docs[id]
	if d != nil && h.shown != "" {
		var shown struct {
			Doc string `json:"doc"`
		}
		if json.Unmarshal([]byte(h.shown), &shown) == nil && shown.Doc == id {
			h.shown = ""
		}
	}
	conns := len(h.clients)
	h.mu.Unlock()
	if d == nil {
		return CloseResult{}, fmt.Errorf("%s is not registered in matomezu (nothing to close)", abs)
	}
	h.broadcast(event{"close", jsonString(map[string]string{"doc": id})})
	return CloseResult{ID: id, Connections: conns}, nil
}

func (h *Hub) versionChanged(id, v string) {
	h.broadcast(event{"version", jsonString(map[string]string{"doc": id, "version": v})})
}

// broadcast は全部の画面に送る。詰まっている画面には送り損ねてもよい（つなぎ直すと全部の版が届く）
func (h *Hub) broadcast(e event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- e:
		default:
		}
	}
}

func jsonString(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// Idle は画面が1つもつながっていない時間。つながっていれば 0。
func (h *Hub) Idle() time.Duration {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.clients) > 0 {
		return 0
	}
	return time.Since(h.idleSince)
}

func (h *Hub) doc(id string) *doc {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.docs[id]
}

func (h *Hub) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")

	ch := make(chan event, 64)
	c := &client{id: newClientID()}
	h.mu.Lock()
	h.clients[ch] = c
	docs := make([]*doc, 0, len(h.docs))
	for _, d := range h.docs {
		docs = append(docs, d)
	}
	shown := ""
	if time.Since(h.shownAt) < showReplay {
		shown = h.shown
	}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clients, ch)
		if len(h.clients) == 0 {
			h.idleSince = time.Now()
		}
		h.mu.Unlock()
	}()

	send := func(e event) bool {
		_, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", e.name, e.data)
		flusher.Flush()
		return err == nil
	}
	// サーバーが入れ替わったときに早くつなぎ直せるよう、再接続の間隔を 1 秒にする
	if _, err := io.WriteString(w, "retry: 1000\n"); err != nil {
		return
	}
	if !send(event{"server", jsonString(h.version)}) {
		return
	}
	if !send(event{"hello", jsonString(map[string]string{"client": c.id})}) {
		return
	}
	// つないだ時点の版を送る。再接続のあいだに変わっていれば、画面はこれで気づける
	for _, d := range docs {
		if !send(event{"version", jsonString(map[string]string{"doc": d.id, "version": d.currentVersion()})}) {
			return
		}
	}
	if shown != "" && !send(event{"open", shown}) {
		return
	}
	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case e := <-ch:
			if !send(e) {
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
	mux.HandleFunc("PUT /d/{id}/api/data", fromPage(withDoc((*doc).putData)))
	mux.HandleFunc("POST /d/{id}/api/layout", fromPage(withDoc((*doc).putLayout)))
	mux.HandleFunc("GET /d/{id}/api/layout", withDoc((*doc).getLayout))
	// 郵便箱（mail.go）。DELETE も本文に {} を付けて送る（画面からの書き込みは JSON の本文だけを受ける。fromPage）
	mux.HandleFunc("GET /d/{id}/api/mail", h.withMail(h.getMail))
	mux.HandleFunc("POST /d/{id}/api/mail", fromPage(h.withMail(h.postMail)))
	mux.HandleFunc("POST /d/{id}/api/mail/read", fromPage(h.withMail(h.readAllMail)))
	mux.HandleFunc("DELETE /d/{id}/api/mail/{item}", fromPage(h.withMail(h.deleteMail)))
	// 以前の図ごとの URL は、画面の URL へ転送する
	toApp := func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/?d="+url.QueryEscape(r.PathValue("id")), http.StatusFound)
	}
	mux.HandleFunc("GET /d/{id}", toApp)
	mux.HandleFunc("GET /d/{id}/{$}", toApp)
	mux.HandleFunc("GET /api/events", h.events)
	mux.HandleFunc("GET /api/info", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]string{"server": h.version})
	})
	mux.HandleFunc("POST /api/watch", fromPage(h.setWatch))
	mux.HandleFunc("POST /api/new", fromPage(h.newBook))
	mux.HandleFunc("GET /api/books", h.books)   // マスターのブックの一覧（books.go）
	mux.HandleFunc("GET /api/master", h.master) // マスター用のファイル（books.go）
	mux.Handle("GET /{$}", h.web)
	mux.Handle("GET /dist/", h.web)

	if h.token != "" {
		mux.HandleFunc("GET /api/ping", h.control(h.ping))
		mux.HandleFunc("POST /api/open", h.control(h.open))
		mux.HandleFunc("POST /api/close", h.control(h.close))
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
		Show bool   `json:"show"`
		Page string `json:"page"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	res, err := h.Open(req.Path, req.Show, req.Page)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, res)
}

func (h *Hub) close(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	res, err := h.Close(req.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, res)
}

// setWatch は、画面が開いている図を受け取る（タブを開いたり閉じたりするたびに届く）
func (h *Hub) setWatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Client string   `json:"client"`
		Docs   []string `json:"docs"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil || req.Client == "" {
		http.Error(w, "client required", http.StatusBadRequest)
		return
	}
	docs := map[string]bool{}
	for _, id := range req.Docs {
		docs[id] = true
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.clients {
		if c.id == req.Client {
			c.docs = docs
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	http.Error(w, "unknown client", http.StatusNotFound)
}

func newClientID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
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
