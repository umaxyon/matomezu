// Package server は matomezu の常駐の HTTP サーバー。127.0.0.1 だけで待つ。
//
//	/                画面（ビルドした web/dist）。そのほかの API に当たらない道はファイルとして配る
//	GET  /api/ping   {"version", "pid"} 立っているかの確認            … 要合言葉
//	POST /api/stop   常駐を止める                                    … 要合言葉
//
// 合言葉は Authorization: Bearer <token> で渡す（server.json の token。常駐ごとに作る）。
package server

import (
	"crypto/subtle"
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"strings"
)

// Options は常駐の中身
type Options struct {
	Web     fs.FS  // 配る画面のファイル（index.html が根）
	Token   string // 合言葉
	Version string
	Stop    func() // /api/stop で呼ぶ。呼ばれたら常駐を止める
}

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
