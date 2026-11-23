package server

// AI が書庫の木を読む口: 書庫ホームかフォルダかブックの外のバインダ 1 つの、書庫ホームからの道筋と、直下のエントリ（1 段だけ）。ブックの中は read_book の口（/api/ai/books/{id}）で読む。
// ゴミ箱と、ゴミ箱の中の物は出さない（無い物として断る）。
//
//	GET /api/ai/folder[?folder=<フォルダの id>]   {"id", "kind": "home" | "folder" | "binder", "title"（書庫ホームには無い）, "pageType"（バインダだけ）, "path": [{"id", "title"}], "lineup": [エントリ]}
//	                                              folder が無ければ書庫ホーム。ブックの外のバインダの id なら、そのバインダと中のページ。path は書庫ホームからそのフォルダまで（両端を含む。書庫ホームの title は無い）。
//	                                              システムフォルダは、どこでも "systemFolder"（定義の id）を添え、title は定義の英語の名前（定義が今の機能台帳に無ければ空）。
//	                                              エントリは {"kind": "folder", "id", "title"}・{"kind": "book", "id", "title"}（読めないブックは出さない）・
//	                                              {"kind": "page", "id", "title", "type"}・{"kind": "binder", "id", "title", "pageType"}。
//	                                              ブックとページには、AI の応えを待つアノテーションが在れば、その数 "awaiting" を、読めるが機能台帳に無い物を持てば、その warning の 1 行 "warning" を添える。
//	                                              バインダには、中のページの awaiting の合計を添える。
//	                                              folder が "my-workdesk" なら、呼んだ AI のワークルームの作業机（kind "workdesk"。データに無い物。id は "my-workdesk"、title はワークルームの名前、
//	                                              path は書庫ホーム・ワークルームのフォルダ・作業机、lineup はワーカーブック〈バックヤードの中のブック〉1 つか、まだ無ければ空）。
//	                                              ワークルームのフォルダを読めば、lineup に呼んだ AI の作業机 {"kind": "workdesk", "id": "my-workdesk", "title"} を 1 つ出す。
//	                                              ワークルームに入っていない AI（ビジターと参加していない者）の "my-workdesk" は {"refused": 断りの 1 行}

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// myWorkdeskFolder は、read_folder が呼んだ AI 自身の作業机を指すのに受ける名前（base の MY_WORKDESK と同じ。フォルダの id でない）
const myWorkdeskFolder = "my-workdesk"

// kindWorkdesk は、AI に見せる作業机の kind（データに無い物なので、フォルダと分ける）
const kindWorkdesk = "workdesk"

// notInWorkroomText は、ワークルームに入っていない AI が作業机を読んだときの断り
const notInWorkroomText = `not-joined: "` + myWorkdeskFolder + `" is the workdesk of your workroom, so it is only for an AI that joined a workroom (a visitor has none).`

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
	// Awaits は、ブックかページの、AI の応えを待つアノテーションの数（list_books の awaiting と同じ数え方）。バインダは中のページの合計
	Awaits int `json:"awaiting,omitempty"`
	// Warning は、ブックかページの、読めるが機能台帳に無いアイテムや設定の項目（W007 の 1 行。list_books の warning と同じ）
	Warning string `json:"warning,omitempty"`
}

// AIFolder は、AI に見せるフォルダ 1 つ（書庫ホームかフォルダか、ブックの外のバインダ）
type AIFolder struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"` // 書庫ホームなら "home"、フォルダなら "folder"、バインダなら "binder"、作業机なら "workdesk"
	Title string `json:"title,omitempty"`
	// PageType は、バインダが入れるタイプ
	PageType string `json:"pageType,omitempty"`
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

// AIFolder は、AI の MCP 公開ツールに出すフォルダ id（空なら書庫ホーム。ブックの外のバインダの id も受ける）と、その直下のエントリ。participant は呼んだ参加者。
// id が myWorkdeskFolder なら、その参加者の作業机（ワークルームに入っていなければ nil）。
// それでない id（ブック・ブックの中のバインダ・ページ・無い id）と、ゴミ箱と、ゴミ箱の中・読めない物のフォルダとバインダなら nil
func (h *Hub) AIFolder(id, participant string) *AIFolder {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.actorOfParticipantHeld(participant).Workroom
	if id == myWorkdeskFolder {
		if room == "" {
			return nil
		}
		return h.myWorkdeskFolderHeld(room)
	}
	if id == "" {
		id = storage.HomeID
	}
	f, ok := h.folders[id]
	binder := h.binderNotInBook(id)
	if !ok || (f.role != storage.RoleHome && f.role != storage.RoleFolder && !binder) || h.outOfSight(id) {
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
		if at == id && binder {
			step.Title, _, _ = rowHead(f.body)
		}
		out.Path = append(out.Path, step)
	}
	if f.role == storage.RoleFolder {
		out.Title, out.SystemFolder = h.folderTitle(f.body)
	}
	if binder {
		out.Title, _, out.PageType = rowHead(f.body)
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
	if room != "" && out.SystemFolder != "" {
		if d, ok := h.myWorkdeskHeld(room); ok && d.Workrooms == id {
			out.Lineup = append(out.Lineup, folderEntry{Kind: kindWorkdesk, ID: myWorkdeskFolder, Title: h.roomNameHeld(room)})
		}
	}
	return out
}

// InWorkroom は、参加者 participant が、参加が確定してワークルームに入っているか
func (h *Hub) InWorkroom(participant string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.actorOfParticipantHeld(participant).Workroom != ""
}

// myWorkdeskFolderHeld は、ワークルーム room の作業机を AI に見せる形（エンジンが答えなければ nil。h.mu を持って呼ぶ）
func (h *Hub) myWorkdeskFolderHeld(room string) *AIFolder {
	d, ok := h.myWorkdeskHeld(room)
	if !ok {
		return nil
	}
	name := h.roomNameHeld(room)
	out := &AIFolder{ID: myWorkdeskFolder, Kind: kindWorkdesk, Title: name, Path: []folderStep{{ID: storage.HomeID}}, Lineup: []folderEntry{}}
	if f, ok := h.folders[d.Workrooms]; ok && d.Workrooms != "" {
		step := folderStep{ID: d.Workrooms}
		step.Title, step.SystemFolder = h.folderTitle(f.body)
		out.Path = append(out.Path, step)
	}
	out.Path = append(out.Path, folderStep{ID: myWorkdeskFolder, Title: name})
	if b, ok := h.folders[d.Book]; ok && b.isBook() && !h.outOfSight(d.Book) && !h.bookWarnings[d.Book].Unreadable {
		title, _, _ := rowHead(b.body)
		out.Lineup = append(out.Lineup, folderEntry{Kind: storage.KindBook, ID: d.Book, Title: title})
	}
	return out
}

// MyWorkerBook は、参加者 participant のワークルームのワーカーブックの id と名前（ワークルームに入っていないか、まだ無い・AI に見せない物なら空）
func (h *Hub) MyWorkerBook(participant string) (id, title string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.actorOfParticipantHeld(participant).Workroom
	if room == "" {
		return "", ""
	}
	d := h.myWorkdeskFolderHeld(room)
	if d == nil || len(d.Lineup) == 0 {
		return "", ""
	}
	return d.Lineup[0].ID, d.Lineup[0].Title
}

// myWorkdeskHeld は、ワークルーム room の作業机（engine.MyWorkdesk。base が決める）。エンジンが答えなければ ok が false（h.mu を持って呼ぶ）
func (h *Hub) myWorkdeskHeld(room string) (engine.MyWorkdesk, bool) {
	if room == "" {
		return engine.MyWorkdesk{}, false
	}
	folders := make([]json.RawMessage, 0, len(h.folders))
	for _, id := range slices.Sorted(maps.Keys(h.folders)) {
		folders = append(folders, h.folders[id].body)
	}
	d, err := h.engine.MyWorkdesk(room, folders, recordSource{h})
	if err != nil {
		fmt.Fprintln(os.Stderr, "could not read the workdesk of workroom", room, ":", err)
		return engine.MyWorkdesk{}, false
	}
	return d, true
}

// roomNameHeld は、ワークルーム room の名前（読めなければ空。h.mu を持って呼ぶ）
func (h *Hub) roomNameHeld(room string) string {
	rooms, err := h.workroomsHeld()
	if err != nil {
		return ""
	}
	return roomName(rooms, room)
}

// FolderOfPage は、ページ page が入っているフォルダ（ブック・バインダを含む）の id（どのフォルダにも入っていなければ空）
func (h *Hub) FolderOfPage(page string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.places[page]
}

func (o Options) aiFolder(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("folder")
	if id == myWorkdeskFolder && !o.Hub.InWorkroom(participantOf(r)) {
		writeJSON(w, map[string]string{"refused": notInWorkroomText})
		return
	}
	f := o.Hub.AIFolder(id, participantOf(r))
	if f == nil {
		http.Error(w, "no such folder", http.StatusNotFound)
		return
	}
	// バインダを読むときは、行がステージエントリでない（中のページ）ので、バインダのアノテーションをページごとに数える
	ids := []string{}
	if f.Kind == storage.RoleBinder {
		ids = append(ids, f.ID)
	}
	for _, e := range f.Lineup {
		if f.Kind != storage.RoleBinder && e.Kind != storage.KindFolder && e.Kind != kindWorkdesk {
			ids = append(ids, e.ID)
		}
	}
	annotations, err := o.Hub.AIAnnotations(ids)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	books, pages := o.Hub.BookWarnings(), o.Hub.OutsidePageWarnings()
	for i, e := range f.Lineup {
		if f.Kind == storage.RoleBinder {
			f.Lineup[i].Awaits = len(pick(annotations[f.ID], func(a aiAnnotation) bool { return a.Awaits && a.Page != nil && *a.Page == e.ID }))
		} else {
			f.Lineup[i].Awaits = len(pick(annotations[e.ID], awaiting))
		}
		switch e.Kind {
		case storage.KindBook:
			f.Lineup[i].Warning = books[e.ID].Warning
		case storage.KindPage:
			f.Lineup[i].Warning = pages[e.ID]
		}
	}
	writeJSON(w, f)
}
