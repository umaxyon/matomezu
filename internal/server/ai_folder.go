package server

// AI が書庫の木を読む口: 書庫ホームかフォルダ 1 つの、書庫ホームからの道筋と、直下のエントリ（1 段だけ）。ブックの中は read_book の口（/api/ai/books/{id}）で読む。
// ゴミ箱と、ゴミ箱の中の物は出さない（無い物として断る）。
//
//	GET /api/ai/folder[?folder=<フォルダの id>]   {"id", "kind": "home" | "folder", "title"（書庫ホームには無い）, "path": [{"id", "title"}], "lineup": [エントリ]}
//	                                              folder が無ければ書庫ホーム。path は書庫ホームからそのフォルダまで（両端を含む。書庫ホームの title は無い）。
//	                                              システムフォルダは、どこでも "systemFolder"（定義の id）を添え、title は定義の英語の名前（定義が今の機能台帳に無ければ空）。
//	                                              エントリは {"kind": "folder", "id", "title"}・{"kind": "book", "id", "title", "problem"（読めないブックの理由。list_books と同じ）}・
//	                                              {"kind": "page", "id", "title", "type"}・{"kind": "binder", "id", "title", "pageType"}・
//	                                              {"kind": "unreadable", "id", "title", "code", "type"}（読めないページ。read_book と同じ）

import (
	"encoding/json"
	"net/http"
	"slices"

	"github.com/umaxyon/matomezu/internal/storage"
)

// folderStep は、書庫ホームからフォルダまでの道筋の 1 つ（書庫ホームは名前を持たない）
type folderStep struct {
	ID           string `json:"id"`
	Title        string `json:"title,omitempty"`
	SystemFolder string `json:"systemFolder,omitempty"`
}

// folderEntry は、AI に見せるフォルダの直下のエントリ 1 つ。Type はページのタイプ、PageType はバインダが入れるタイプ、
// Code は読めないページの理由の warning の番号、Problem は読めないブックの理由（warning の 1 行）
type folderEntry struct {
	Kind     string `json:"kind"`
	ID       string `json:"id"`
	Title    string `json:"title"`
	Type     string `json:"type,omitempty"`
	PageType string `json:"pageType,omitempty"`
	Code     string `json:"code,omitempty"`
	Problem  string `json:"problem,omitempty"`
	// SystemFolder は、システムフォルダの印（定義の id）
	SystemFolder string `json:"systemFolder,omitempty"`
}

// AIFolder は、AI に見せるフォルダ 1 つ（書庫ホームかフォルダ）
type AIFolder struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"` // 書庫ホームなら "home"、フォルダなら "folder"
	Title string `json:"title,omitempty"`
	// SystemFolder は、システムフォルダなら、その印（定義の id）
	SystemFolder string        `json:"systemFolder,omitempty"`
	Path         []folderStep  `json:"path"`
	Lineup       []folderEntry `json:"lineup"`
}

// rowHead は、ページかフォルダの行の本文のうち、常駐が読む土台のフィールド（名前・ページのタイプ・バインダが入れるタイプ。文字でなければ空）
func rowHead(body json.RawMessage) (title, pageType, binderType string) {
	var row map[string]json.RawMessage
	_ = json.Unmarshal(body, &row)
	_ = json.Unmarshal(row["title"], &title)
	_ = json.Unmarshal(row["type"], &pageType)
	_ = json.Unmarshal(row["pageType"], &binderType)
	return title, pageType, binderType
}

// folderTitle は、フォルダの行の本文 body の、AI に見せる名前と、システムフォルダならその印。システムフォルダの名前は、定義の英語の名前（定義が無ければ空）
func (h *Hub) folderTitle(body json.RawMessage) (title, systemFolder string) {
	var row struct {
		Title        string `json:"title"`
		SystemFolder string `json:"systemFolder"`
	}
	_ = json.Unmarshal(body, &row)
	if row.SystemFolder != "" {
		return h.systemFolderTitles[row.SystemFolder], row.SystemFolder
	}
	return row.Title, ""
}

// AIFolder は、AI の MCP 公開ツールに出すフォルダ id（空なら書庫ホーム）と、その直下のエントリ。
// 書庫ホームでもフォルダでもない id（ブック・バインダ・ページ・無い id）と、ゴミ箱と、ゴミ箱の中のフォルダなら nil
func (h *Hub) AIFolder(id string) *AIFolder {
	h.mu.Lock()
	defer h.mu.Unlock()
	if id == "" {
		id = storage.HomeID
	}
	f, ok := h.folders[id]
	if !ok || (f.role != "home" && f.role != "folder") || h.inTrash(id) {
		return nil
	}
	out := &AIFolder{ID: id, Kind: f.role, Path: []folderStep{}, Lineup: []folderEntry{}}
	above := h.foldersAbove(id)
	slices.Reverse(above)
	for _, at := range append(above, id) {
		step := folderStep{ID: at}
		if h.folders[at].role == "folder" {
			step.Title, step.SystemFolder = h.folderTitle(h.folders[at].body)
		}
		out.Path = append(out.Path, step)
	}
	if f.role == "folder" {
		out.Title, out.SystemFolder = h.folderTitle(f.body)
	}
	for _, e := range f.entries {
		if p, ok := h.pages[e]; ok {
			title, pageType, _ := rowHead(p.body)
			if n, unreadable := h.pageWarnings[e]; unreadable {
				out.Lineup = append(out.Lineup, folderEntry{Kind: "unreadable", ID: e, Title: title, Code: n.Code, Type: pageType})
				continue
			}
			out.Lineup = append(out.Lineup, folderEntry{Kind: "page", ID: e, Title: title, Type: pageType})
			continue
		}
		inner, ok := h.folders[e]
		if !ok {
			continue
		}
		title, _, binderType := rowHead(inner.body)
		switch {
		case inner.role == "folder":
			title, mark := h.folderTitle(inner.body)
			out.Lineup = append(out.Lineup, folderEntry{Kind: "folder", ID: e, Title: title, SystemFolder: mark})
		case inner.role == "binder":
			out.Lineup = append(out.Lineup, folderEntry{Kind: "binder", ID: e, Title: title, PageType: binderType})
		case inner.isBook():
			entry := folderEntry{Kind: "book", ID: e, Title: title}
			if n, ok := h.bookWarnings[e]; ok && n.Unreadable {
				entry.Problem = n.Warning
			}
			out.Lineup = append(out.Lineup, entry)
		}
	}
	return out
}

// FolderOfPage は、ページ page が入っているフォルダ（ブック・バインダを含む）の id（どのフォルダにも入っていなければ空）
func (h *Hub) FolderOfPage(page string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.places[page]
}

func (o Options) aiFolder(w http.ResponseWriter, r *http.Request) {
	f := o.Hub.AIFolder(r.URL.Query().Get("folder"))
	if f == nil {
		http.Error(w, "no such folder", http.StatusNotFound)
		return
	}
	writeJSON(w, f)
}
