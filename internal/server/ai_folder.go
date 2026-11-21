package server

// AI が書庫の木を読む口: 書庫ホームかフォルダ 1 つの、書庫ホームからの道筋と、直下のエントリ（1 段だけ）。ブックの中は read_book の口（/api/ai/books/{id}）で読む。
// ゴミ箱と、ゴミ箱の中の物は出さない（無い物として断る）。
//
//	GET /api/ai/folder[?folder=<フォルダの id>]   {"id", "kind": "home" | "folder", "title"（書庫ホームには無い）, "path": [{"id", "title"}], "lineup": [エントリ]}
//	                                              folder が無ければ書庫ホーム。path は書庫ホームからそのフォルダまで（両端を含む。書庫ホームの title は無い）。
//	                                              システムフォルダは、どこでも "systemFolder"（定義の id）を添え、title は定義の英語の名前（定義が今の機能台帳に無ければ空）。
//	                                              エントリは {"kind": "folder", "id", "title"}・{"kind": "book", "id", "title"}（読めないブックは出さない）・
//	                                              {"kind": "page", "id", "title", "type"}・{"kind": "binder", "id", "title", "pageType"}。
//	                                              ブックとページには、AI の応えを待つアノテーションが在れば、その数 "awaiting" を、読めるが機能台帳に無い物を持てば、その warning の 1 行 "warning" を添える

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

// folderEntry は、AI に見せるフォルダの直下のエントリ 1 つ。Type はページのタイプ、PageType はバインダが入れるタイプ
type folderEntry struct {
	Kind     string `json:"kind"`
	ID       string `json:"id"`
	Title    string `json:"title"`
	Type     string `json:"type,omitempty"`
	PageType string `json:"pageType,omitempty"`
	// SystemFolder は、システムフォルダの印（定義の id）
	SystemFolder string `json:"systemFolder,omitempty"`
	// Awaits は、ブックかページの、AI の応えを待つアノテーションの数（list_books の awaiting と同じ数え方）
	Awaits int `json:"awaiting,omitempty"`
	// Warning は、ブックかページの、読めるが機能台帳に無いアイテムや設定の項目（W007 の 1 行。list_books の warning と同じ）
	Warning string `json:"warning,omitempty"`
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
// 名前の読み方は、web/src/core/entries.ts の rowTitle（言語を英語にしたとき）と同じ決まり
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
	if !ok || (f.role != storage.RoleHome && f.role != storage.RoleFolder) || h.outOfSight(id) {
		return nil
	}
	out := &AIFolder{ID: id, Kind: f.role, Path: []folderStep{}, Lineup: []folderEntry{}}
	above := h.foldersAbove(id)
	slices.Reverse(above)
	for _, at := range append(above, id) {
		step := folderStep{ID: at}
		if h.folders[at].role == storage.RoleFolder {
			step.Title, step.SystemFolder = h.folderTitle(h.folders[at].body)
		}
		out.Path = append(out.Path, step)
	}
	if f.role == storage.RoleFolder {
		out.Title, out.SystemFolder = h.folderTitle(f.body)
	}
	for _, e := range f.entries {
		if p, ok := h.pages[e]; ok {
			title, pageType, _ := rowHead(p.body)
			out.Lineup = append(out.Lineup, folderEntry{Kind: storage.KindPage, ID: e, Title: title, Type: pageType})
			continue
		}
		inner, ok := h.folders[e]
		if !ok {
			continue
		}
		title, _, binderType := rowHead(inner.body)
		switch {
		case inner.role == storage.RoleFolder:
			title, mark := h.folderTitle(inner.body)
			out.Lineup = append(out.Lineup, folderEntry{Kind: storage.KindFolder, ID: e, Title: title, SystemFolder: mark})
		case inner.role == storage.RoleBinder:
			out.Lineup = append(out.Lineup, folderEntry{Kind: storage.KindBinder, ID: e, Title: title, PageType: binderType})
		case inner.isBook() && !h.bookWarnings[e].Unreadable:
			out.Lineup = append(out.Lineup, folderEntry{Kind: storage.KindBook, ID: e, Title: title})
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
	ids := []string{}
	for _, e := range f.Lineup {
		if e.Kind == storage.KindBook || e.Kind == storage.KindPage {
			ids = append(ids, e.ID)
		}
	}
	annotations, err := o.Hub.AIAnnotations(ids)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	warnings := o.Hub.BookWarnings()
	for i, e := range f.Lineup {
		f.Lineup[i].Awaits = len(pick(annotations[e.ID], awaiting))
		if e.Kind == storage.KindBook || e.Kind == storage.KindPage {
			f.Lineup[i].Warning = warnings[e.ID].Warning
		}
	}
	writeJSON(w, f)
}
