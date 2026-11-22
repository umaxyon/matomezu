package server

// 利用者が端末で打つ matomezu の名前。Windows で npm が置いた matomezu.ps1 は PowerShell の既定の実行ポリシーで止まるので、
// そこでは隣の matomezu.cmd を打ってもらう。名前は立てる側（cmd/matomezu）が見分けて渡し、常駐は入れ方の事情を知らない。
// 画面には index.html の meta（commandMeta）で、AI には頼む文（askUpdateLine・joinRules）で渡す。画面 cookie の無い画面（開き方の案内）も読めるよう、meta にする

import (
	"bytes"
	"html"
	"io/fs"
	"net/http"
)

// defaultCommand は、名前を渡されていない常駐の名前
const defaultCommand = "matomezu"

// commandMeta は、画面が名前を読む meta の name（web/src/host-client/window-io.ts と同じ）
const commandMeta = "matomezu-command"

// SetCommand は、利用者が端末で打つ matomezu の名前を入れる（空なら matomezu）
func (h *Hub) SetCommand(name string) {
	if name == "" {
		name = defaultCommand
	}
	h.command.Store(&name)
}

// Command は、利用者が端末で打つ matomezu の名前
func (h *Hub) Command() string {
	if p := h.command.Load(); p != nil {
		return *p
	}
	return defaultCommand
}

// webFiles は、画面のファイルを配る。index.html には名前の meta を足す
func (o Options) webFiles() http.Handler {
	files := http.FileServerFS(o.Web)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			files.ServeHTTP(w, r)
			return
		}
		page, err := fs.ReadFile(o.Web, "index.html")
		if err != nil {
			files.ServeHTTP(w, r)
			return
		}
		meta := `<meta name="` + commandMeta + `" content="` + html.EscapeString(o.Hub.Command()) + `" />`
		page = bytes.Replace(page, []byte("</head>"), []byte(meta+"\n  </head>"), 1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(page)
	})
}
