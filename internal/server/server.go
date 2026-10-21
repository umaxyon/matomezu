// Package server は matomezu の常駐の HTTP サーバー。127.0.0.1 だけで待つ。
//
//	/                     画面（ビルドした web/dist）。そのほかの API に当たらない道はファイルとして配る
//	GET  /api/ping        {"version", "pid"} 立っているかの確認                                  … 要合言葉
//	POST /api/stop        常駐を止める                                                          … 要合言葉
//	GET  /api/data        {"books": [{"id", "book", "version"}], "settings"} 置いてあるブックと設定  … 画面から
//	GET  /api/events      SSE。世界の変わり目の知らせ（hub.go）                                    … 画面から
//	POST /api/perform     {"action", "args", "on", "lang", "ids", "client", "seq"} アクションを行い、{"ok", "reason", "result"} を返す。
//	                      変わったものは /api/events で知らせる                                     … 画面から
//	PUT  /api/books/{id}  {"book", "base"} アクションを通さずにブックを丸ごと置く。置いてある版が base のときだけ書き、{"version"} を返す。
//	                      base が 0 なら新しいブック。違えば 409 と、置いてある {"id", "book", "version"}  … 画面から
//	POST /api/view        {"client", "view", "focused"} 画面のカレントのステージが見ているもの（view）と、その画面がフォーカスされたか  … 画面から
//
// AI の入口（MCP。internal/mcp）は合言葉で通す:
//
//	GET  /api/ai/view        最後にフォーカスされた画面が見ているもの（{"book", "page", "selection"}。無ければ null）
//	GET  /api/ai/books       {"books": [{"id", "type", "title", "version"}]}
//	GET  /api/ai/books/{id}  {"id", "book", "version"}
//	GET  /api/ai/catalog     アクションとアイテムの目録（engine.Catalog）
//	POST /api/ai/perform     {"action", "args", "on"} アクションを利用者の言語で行い、{"ok", "reason", "result"} を返す
//	POST /api/ai/show        {"book", "page", "stage", "split"} 最後にフォーカスされた画面にブックを出す（Hub.Show）。
//	                         画面が無ければブラウザで開き、つながるのを待ってから出す。{"ok", "opened"} か {"ok": false, "reason", "url"} を返す
//
// 合言葉は Authorization: Bearer <token> で渡す（server.json の token。常駐ごとに作る）。
// 「画面から」の入口は、この常駐の画面からの頼みだけを受ける（sameOrigin。ほかのサイトに開かれたページから書かせない）。
package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// user は設定の持ち主。利用者の区別ができるまでは 1 人
const user = "me"

// 書く頼みの中身の大きさの上限
const maxBody = 16 << 20

// Options は常駐の中身
type Options struct {
	Web     fs.FS  // 配る画面のファイル（index.html が根）
	Token   string // 合言葉
	Version string
	Stop    func() // /api/stop で呼ぶ。呼ばれたら常駐を止める
	Hub     *Hub
	URL     string        // 画面の URL
	Open    func() error  // 画面をブラウザで開く（無ければ開かない）
	Wait    time.Duration // ブラウザで開いた画面がつながるのを待つ長さ（0 なら windowWait）
}

// windowWait は、ブラウザで開いた画面がつながるのを待つ既定の長さ
const windowWait = 20 * time.Second

// 知らせが無いあいだ、つながりを保つために送る間隔
const keepAlive = 25 * time.Second

// Handler は常駐の入口をまとめた http.Handler
func Handler(o Options) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /api/ping", o.auth(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"version": o.Version, "pid": os.Getpid()})
	}))
	mux.Handle("POST /api/stop", o.auth(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{})
		if o.Stop != nil {
			go o.Stop()
		}
	}))
	mux.Handle("GET /api/data", sameOrigin(o.data))
	mux.Handle("GET /api/events", sameOrigin(o.events))
	mux.Handle("POST /api/perform", sameOrigin(o.perform))
	mux.Handle("PUT /api/books/{id}", sameOrigin(o.putBook))
	mux.Handle("POST /api/view", sameOrigin(o.view))
	mux.Handle("GET /api/ai/view", o.auth(o.aiView))
	mux.Handle("GET /api/ai/books", o.auth(o.aiBooks))
	mux.Handle("GET /api/ai/books/{id}", o.auth(o.aiBook))
	mux.Handle("GET /api/ai/catalog", o.auth(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(o.Hub.Catalog())
	}))
	mux.Handle("POST /api/ai/perform", o.auth(o.aiPerform))
	mux.Handle("POST /api/ai/show", o.auth(o.aiShow))
	mux.Handle("/api/", http.NotFoundHandler())
	mux.Handle("/", http.FileServerFS(o.Web))
	return mux
}

// auth は合言葉の合う頼みだけを通す
func (o Options) auth(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || subtle.ConstantTimeCompare([]byte(got), []byte(o.Token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		h(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// sameOrigin は、この常駐の画面からの頼みだけを通す。宛先（Host）が手元の名前で、
// Origin があればその宛先と同じ（ほかのサイトのページからは Origin が違う）。書く頼みは JSON の本文に限る（ほかのサイトのフォームからは送れない）
func sameOrigin(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		local := err == nil && (host == "localhost" || net.ParseIP(host) != nil && net.ParseIP(host).IsLoopback())
		origin := r.Header.Get("Origin")
		if !local || (origin != "" && origin != "http://"+r.Host) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet {
			if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
				http.Error(w, "the body must be JSON", http.StatusUnsupportedMediaType)
				return
			}
		}
		h(w, r)
	})
}

func (o Options) data(w http.ResponseWriter, _ *http.Request) {
	books, settings := o.Hub.Data()
	if settings == nil {
		settings = json.RawMessage("null")
	}
	writeJSON(w, map[string]any{"books": books, "settings": settings})
}

func (o Options) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming is not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	c := o.Hub.Join()
	defer o.Hub.Leave(c)
	tick := time.NewTicker(keepAlive)
	defer tick.Stop()
	for {
		select {
		case ev, ok := <-c.ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.name, ev.data)
		case <-tick.C:
			fmt.Fprint(w, ": keep\n\n")
		case <-r.Context().Done():
			return
		}
		flusher.Flush()
	}
}

func (o Options) perform(w http.ResponseWriter, r *http.Request) {
	var p Perform
	if !readJSON(w, r, &p) {
		return
	}
	done, err := o.Hub.Perform(p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, done)
}

func (o Options) putBook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Book json.RawMessage `json:"book"`
		Base int64           `json:"base"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	id := r.PathValue("id")
	var head struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(req.Book, &head) != nil || head.ID != id {
		http.Error(w, "the book must be an object with the id of the path", http.StatusBadRequest)
		return
	}
	version, have, err := o.Hub.PutBook(id, req.Book, req.Base)
	if errors.Is(err, ErrConflict) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(have)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"version": version})
}

func (o Options) view(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Client  string          `json:"client"`
		View    json.RawMessage `json:"view"`
		Focused bool            `json:"focused"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !o.Hub.SetView(req.Client, req.View, req.Focused) {
		http.Error(w, "unknown client", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{})
}

func (o Options) aiView(w http.ResponseWriter, _ *http.Request) {
	v := o.Hub.View()
	if v == nil {
		v = json.RawMessage("null")
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(v)
}

func (o Options) aiBooks(w http.ResponseWriter, _ *http.Request) {
	books, _ := o.Hub.Data()
	type head struct {
		ID      string `json:"id"`
		Type    string `json:"type"`
		Title   string `json:"title"`
		Version int64  `json:"version"`
	}
	heads := make([]head, 0, len(books))
	for _, b := range books {
		h := head{ID: b.ID, Version: b.Version}
		_ = json.Unmarshal(b.Body, &h)
		h.ID, h.Version = b.ID, b.Version
		heads = append(heads, h)
	}
	writeJSON(w, map[string]any{"books": heads})
}

func (o Options) aiBook(w http.ResponseWriter, r *http.Request) {
	b := o.Hub.Book(r.PathValue("id"))
	if b == nil {
		http.Error(w, "no such book", http.StatusNotFound)
		return
	}
	writeJSON(w, b)
}

func (o Options) aiPerform(w http.ResponseWriter, r *http.Request) {
	var p Perform
	if !readJSON(w, r, &p) {
		return
	}
	done, err := o.Hub.Perform(Perform{Action: p.Action, Args: p.Args, On: p.On, Lang: o.Hub.Lang()})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, done)
}

func (o Options) aiShow(w http.ResponseWriter, r *http.Request) {
	var req Show
	if !readJSON(w, r, &req) {
		return
	}
	err := o.Hub.Show(req)
	opened := false
	if errors.Is(err, ErrNoWindow) && o.Open != nil {
		if open := o.Open(); open != nil {
			writeJSON(w, map[string]any{"ok": false, "reason": "no-browser", "detail": open.Error(), "url": o.URL})
			return
		}
		wait := o.Wait
		if wait == 0 {
			wait = windowWait
		}
		opened = true
		if o.Hub.WaitWindow(wait) {
			err = o.Hub.Show(req)
		}
	}
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "reason": err.Error(), "url": o.URL})
		return
	}
	writeJSON(w, map[string]any{"ok": true, "opened": opened})
}

// readJSON は本文を v に読む。読めなければ 400 を返して false
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err == nil {
		err = json.Unmarshal(b, v)
	}
	if err != nil {
		http.Error(w, "the body is not JSON: "+err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}
