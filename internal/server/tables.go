package server

// ページとフォルダの表: 常駐が持つブックのデータは、ページ 1 枚ずつとフォルダ 1 つずつ（置き場所と同じ単位。版もそれぞれが持つ）。
// フォルダは、書庫ホーム・フォルダ・ブック・バインダ（storage/library.go）。どれもエントリ（ページ・バインダ・ブック・フォルダ）の id を順に持つ。
// エントリの入っているフォルダは places にも持つ（ページから持ち主のブックを引くのに使う）。
// ブックの本文（並びにページとバインダの中身ごと持つ形）が要る所（AI に見せる・エンジンに確かめさせる）には、ここで組んだ物を渡す（books。変わったブックだけ組み直す）。
// 組むのは形だけ: フォルダの lineup のうち、id だけのエントリ（kind と id だけを持つ）を、表の中身に替える（core/folders.ts の rawBooksOf と同じ決まり）。
// ブックは、役（folderRole）が home・folder・binder のどれでもないフォルダ（形の壊れた物も、読めないブックとして 1 冊に数える）

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// row は、表の 1 行（ページかフォルダ）の本文と版
type row struct {
	body    json.RawMessage
	version int64
}

// folderRow は、フォルダの 1 行と、その役（folderRole）と lineup の id だけのエントリの id（覚えるときに 1 度だけ読む）
type folderRow struct {
	row
	role    string
	entries []string
}

// isBook は、フォルダの行がブックか（storage.IsBookRole）
func (f folderRow) isBook() bool { return storage.IsBookRole(f.role) }

// isHomeOrFolder は、フォルダの行が書庫ホームかフォルダか（ブックとバインダを入れる側）
func (f folderRow) isHomeOrFolder() bool { return f.role == "home" || f.role == "folder" }

// entryRef は、lineup の要素が id だけのエントリなら、その kind と id（そうでなければ ok が false）
func entryRef(entry json.RawMessage) (kind, id string, ok bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(entry, &fields) != nil || len(fields) != 2 {
		return "", "", false
	}
	if json.Unmarshal(fields["kind"], &kind) != nil || json.Unmarshal(fields["id"], &id) != nil || id == "" {
		return "", "", false
	}
	return kind, id, kind == "page" || kind == "binder" || kind == "book" || kind == "folder"
}

// newFolderRow は、フォルダの本文 body を覚える形にする
func newFolderRow(body json.RawMessage, version int64) folderRow {
	f := folderRow{row: row{body, version}, role: storage.RoleOf(body)}
	for _, e := range lineupOf(body) {
		if _, id, ok := entryRef(e); ok {
			f.entries = append(f.entries, id)
		}
	}
	return f
}

// loadTables は、置き場所からページとフォルダとエントリの入っているフォルダを読み、ブックを組む（NewHub が呼ぶ）
func (h *Hub) loadTables() error {
	pages, err := h.store.Pages()
	if err != nil {
		return err
	}
	folders, err := h.store.Folders()
	if err != nil {
		return err
	}
	places, err := h.store.Entries()
	if err != nil {
		return err
	}
	h.pages = map[string]row{}
	for _, p := range pages {
		h.pages[p.ID] = row{p.Body, p.Version}
	}
	h.folders = map[string]folderRow{}
	for _, f := range folders {
		h.folders[f.ID] = newFolderRow(f.Body, f.Version)
	}
	h.places = places
	h.books = map[string]entry{}
	h.order = nil
	for _, f := range folders {
		if h.folders[f.ID].isBook() {
			h.order = append(h.order, f.ID)
			h.rebuild(f.ID)
		}
	}
	return nil
}

// assemble は、フォルダ id を、エントリを中身に替えて組んだ本文（binder なら、並びのエントリの形にする。フォルダが無ければ nil）
func (h *Hub) assemble(id string, binder bool) json.RawMessage {
	f, ok := h.folders[id]
	if !ok {
		return nil
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(f.body, &fields) != nil {
		return f.body
	}
	delete(fields, "folderRole")
	if binder {
		fields["kind"] = json.RawMessage(`"binder"`)
	}
	var lineup []json.RawMessage
	if raw, has := fields["lineup"]; has && json.Unmarshal(raw, &lineup) == nil {
		parts := make([]json.RawMessage, 0, len(lineup))
		for _, e := range lineup {
			kind, entry, isRef := entryRef(e)
			switch {
			case isRef && kind == "page":
				if p, ok := h.pages[entry]; ok {
					e = p.body
				}
			case isRef && kind == "binder":
				if inner := h.assemble(entry, true); inner != nil {
					e = inner
				}
			}
			parts = append(parts, e)
		}
		raw, err := json.Marshal(parts)
		if err != nil {
			return f.body
		}
		fields["lineup"] = raw
	}
	out, err := json.Marshal(fields)
	if err != nil {
		return f.body
	}
	return out
}

// rebuild は、ブック ids の組んだ本文を作り直す（ブックのフォルダが無くなっていれば・ブックでないフォルダなら、books から外す。h.mu を持って呼ぶ）
func (h *Hub) rebuild(ids ...string) {
	for _, id := range ids {
		f, ok := h.folders[id]
		if !ok || !f.isBook() {
			delete(h.books, id)
			continue
		}
		h.books[id] = newEntry(h.assemble(id, false), f.version)
	}
}

// bookOfEntry は、エントリ（ページかバインダ）id を持っているブックの id: 入っているフォルダを上へたどって、最初のブック（どのブックにも入っていなければ空。h.mu を持って呼ぶ）
func (h *Hub) bookOfEntry(id string) string {
	for _, at := range h.foldersAbove(id) {
		if h.folders[at].isBook() {
			return at
		}
	}
	return ""
}

// foldersAbove は、エントリ id が入っているフォルダから上へ、書庫ホームまでの id（近い順。表に無いフォルダで止める。輪になっていれば、通ったフォルダで止める。h.mu を持って呼ぶ）
func (h *Hub) foldersAbove(id string) []string {
	out := []string{}
	seen := map[string]bool{id: true}
	for at, ok := h.places[id]; ok && !seen[at]; at, ok = h.places[at] {
		if _, known := h.folders[at]; !known {
			break
		}
		seen[at] = true
		out = append(out, at)
	}
	return out
}

// checkLibrary は、フォルダとページの行の全部が木の決まりを守るかを確かめ、warning の一覧を直す。変わった warning は常駐のログに書く
// （確かめられなければ、ログに書いて一覧はそのまま。h.mu を持って呼ぶ）
func (h *Hub) checkLibrary() {
	rows := make([]json.RawMessage, 0, len(h.folders))
	for _, id := range slices.Sorted(maps.Keys(h.folders)) {
		rows = append(rows, h.folders[id].body)
	}
	line, err := h.engine.CheckLibrary(rows, slices.Sorted(maps.Keys(h.pages)))
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the library:", err)
		return
	}
	if line != "" && line != h.libraryWarning {
		fmt.Fprintln(os.Stderr, "warning:", line)
	}
	h.libraryWarning = line
}

// homeAndFolderRows は、書庫ホームとフォルダの行の全部（書庫ホームを先に、ほかは id の順。エンジンに渡す。h.mu を持って呼ぶ）
func (h *Hub) homeAndFolderRows() []json.RawMessage {
	out := []json.RawMessage{}
	if f, ok := h.folders[storage.HomeID]; ok && f.isHomeOrFolder() {
		out = append(out, f.body)
	}
	for _, id := range slices.Sorted(maps.Keys(h.folders)) {
		if f := h.folders[id]; id != storage.HomeID && f.isHomeOrFolder() {
			out = append(out, f.body)
		}
	}
	return out
}

// homeAndFoldersAbove は、ブック ids から書庫ホームまでの、書庫ホームとフォルダの行（ブックごとに近い順。重ねない。エンジンに渡す。h.mu を持って呼ぶ）
func (h *Hub) homeAndFoldersAbove(ids []string) []json.RawMessage {
	out := []json.RawMessage{}
	seen := map[string]bool{}
	for _, id := range ids {
		for _, at := range h.foldersAbove(id) {
			if f := h.folders[at]; f.isHomeOrFolder() && !seen[at] {
				seen[at] = true
				out = append(out, f.body)
			}
		}
	}
	return out
}

// rowsUnder は、ブック id のフォルダと、その下のページとバインダの id の全部（バインダでないフォルダの中へは降りない。h.mu を持って呼ぶ）
func (h *Hub) rowsUnder(id string) []string {
	f, ok := h.folders[id]
	if !ok {
		return nil
	}
	out := []string{id}
	for _, e := range f.entries {
		if inner, folder := h.folders[e]; !folder {
			out = append(out, e)
		} else if inner.role == "binder" {
			out = append(out, h.rowsUnder(e)...)
		}
	}
	return out
}

// rowsOf は、ブック ids のページとフォルダの本文（エンジンに渡す。ブックのフォルダ・その下のバインダ・その中のページ。バインダでないフォルダの中へは降りない。h.mu を持って呼ぶ）
func (h *Hub) rowsOf(ids []string) (pages, folders []json.RawMessage) {
	pages, folders = []json.RawMessage{}, []json.RawMessage{}
	var walk func(id string)
	walk = func(id string) {
		f, ok := h.folders[id]
		if !ok {
			return
		}
		folders = append(folders, f.body)
		for _, e := range f.entries {
			if p, ok := h.pages[e]; ok {
				pages = append(pages, p.body)
			} else if h.folders[e].role == "binder" {
				walk(e)
			}
		}
	}
	for _, id := range ids {
		walk(id)
	}
	return pages, folders
}

// entryPuts は、フォルダ changed（id → 新しい本文。無くなったフォルダは nil）と、無くなったページ gone を当てたときの、エントリの入っているフォルダの書き込み。
// 新しい本文の id だけのエントリは、そのフォルダに入る。前に入っていて、どの新しい本文にも無いエントリと、無くなったページ・フォルダは、どこにも入らない（h.mu を持って呼ぶ。何も変えない）
func (h *Hub) entryPuts(changed map[string]json.RawMessage, gone []string) []storage.EntryPut {
	claimed := map[string]string{}
	for _, id := range slices.Sorted(maps.Keys(changed)) {
		if changed[id] == nil {
			continue
		}
		for _, e := range newFolderRow(changed[id], 0).entries {
			claimed[e] = id
		}
	}
	puts := []storage.EntryPut{}
	left := map[string]bool{}
	for _, id := range slices.Sorted(maps.Keys(changed)) {
		for _, e := range h.folders[id].entries {
			if _, kept := claimed[e]; !kept {
				left[e] = true
			}
		}
		if changed[id] == nil {
			left[id] = true
		}
	}
	for _, id := range gone {
		left[id] = true
	}
	for _, e := range slices.Sorted(maps.Keys(left)) {
		if _, kept := claimed[e]; !kept {
			if _, in := h.places[e]; in {
				puts = append(puts, storage.EntryPut{ID: e})
			}
		}
	}
	for _, e := range slices.Sorted(maps.Keys(claimed)) {
		if h.places[e] != claimed[e] {
			puts = append(puts, storage.EntryPut{ID: e, Folder: claimed[e]})
		}
	}
	return puts
}

// Tables は、全部のページとフォルダ（版つき。ゴミ箱のブックの分も。id の順）
func (h *Hub) Tables() ([]storage.Page, []storage.Folder) {
	h.mu.Lock()
	defer h.mu.Unlock()
	pages := make([]storage.Page, 0, len(h.pages))
	for _, id := range slices.Sorted(maps.Keys(h.pages)) {
		pages = append(pages, storage.Page{ID: id, Body: h.pages[id].body, Version: h.pages[id].version})
	}
	folders := make([]storage.Folder, 0, len(h.folders))
	for _, id := range slices.Sorted(maps.Keys(h.folders)) {
		folders = append(folders, storage.Folder{ID: id, Body: h.folders[id].body, Version: h.folders[id].version})
	}
	return pages, folders
}

// PageVersion は、ページ id の版（無ければ 0）
func (h *Hub) PageVersion(id string) int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.pages[id].version
}

// replaceBook は、ブック id を本文 body（並びにページとバインダの中身ごと持つ形）に丸ごと置き換えて、窓に知らせる（アクションも認可も通さない。ブックを丸ごと受け取る、テストの用意の入口が使う）。
// 置いてあるブックのフォルダの版が base のときだけ（まだ無ければ base は 0）で、違えば conflict。本文は置き場所の決まり（storage.SplitBook）で分け、分けられない本文は、そのままフォルダの 1 行にする。
// まだどのフォルダにも入っていないブックは、書庫ホームの並びの末尾に足す。
// 返すのは、書いた後のブックのフォルダの版（h.mu を持って呼ぶ）
func (h *Hub) replaceBook(id string, body json.RawMessage, base int64) (version int64, conflict bool, err error) {
	return h.putWholeBook(id, body, base, false)
}

// replaceBookQuietly は replaceBook と同じに置き換えるが、窓に知らせず、触れた時刻も残さない（世界を空にして置き直す、テストの用意の入口が使う。h.mu を持って呼ぶ）
func (h *Hub) replaceBookQuietly(id string, body json.RawMessage, base int64) (version int64, conflict bool, err error) {
	return h.putWholeBook(id, body, base, true)
}

func (h *Hub) putWholeBook(id string, body json.RawMessage, base int64, quiet bool) (version int64, conflict bool, err error) {
	if h.folders[id].version != base {
		return 0, true, nil
	}
	// そのブックが今持っているページとフォルダ（置き換えで無くなる物を消し、id を使い直せるようにする）
	old := map[string]bool{}
	for _, row := range h.rowsUnder(id) {
		old[row] = true
	}
	taken := map[string]bool{}
	for other := range h.pages {
		taken[other] = !old[other]
	}
	for other := range h.folders {
		taken[other] = !old[other]
	}
	split, ok := storage.SplitBook(body, taken)
	if !ok {
		split = storage.Split{Folders: []storage.Row{{ID: id, Body: body}}}
	}
	out := engine.Output{Books: []string{id}}
	kept := map[string]bool{}
	for _, p := range split.Pages {
		kept[p.ID] = true
		out.Pages = append(out.Pages, engine.RowChange{ID: p.ID, Row: p.Body})
	}
	for _, f := range split.Folders {
		kept[f.ID] = true
		out.Folders = append(out.Folders, engine.RowChange{ID: f.ID, Row: f.Body})
	}
	// まだどのフォルダにも入っていないブックは、書庫ホームの並びの末尾に足す
	if _, placed := h.places[id]; !placed {
		home, err := h.homeWith(func(lineup []json.RawMessage) []json.RawMessage { return append(lineup, storage.RefOf("book", id)) })
		if err != nil {
			return 0, false, err
		}
		out.Folders = append(out.Folders, engine.RowChange{ID: storage.HomeID, Row: home})
	}
	for _, gone := range slices.Sorted(maps.Keys(old)) {
		if kept[gone] {
			continue
		}
		if _, page := h.pages[gone]; page {
			out.Pages = append(out.Pages, engine.RowChange{ID: gone, Removed: true})
		} else {
			out.Folders = append(out.Folders, engine.RowChange{ID: gone, Removed: true})
		}
	}
	plan, err := h.planWrites(out, "host", "", stamp())
	if err != nil {
		return 0, false, err
	}
	plan.quiet = quiet
	if err := h.store.Apply(plan.batch); err != nil {
		return 0, false, err
	}
	h.applyWrites(plan, out, Perform{}, "host", "")
	return h.folders[id].version, false, nil
}

// homeWith は、書庫ホームの並びを change で替えた本文（書庫ホームが無ければ、空の並びから作る。h.mu を持って呼ぶ。何も変えない）
func (h *Hub) homeWith(change func([]json.RawMessage) []json.RawMessage) (json.RawMessage, error) {
	f, ok := h.folders[storage.HomeID]
	if !ok {
		return storage.HomeBody(change(nil)), nil
	}
	return withLineup(f.body, change(slices.Clone(lineupOf(f.body))))
}

// clearBooks は、全部のブック（ページとフォルダとエントリ、開いた時刻、AI 編集チケット、ページのアノテーション）を、置き場所とメモリから消す。
// 書庫ホームは残して、並びを空にする（窓には知らせない。テストの用意が使う。h.mu を持って呼ぶ）
func (h *Hub) clearBooks() error {
	var batch storage.Batch
	for id, p := range h.pages {
		batch.Pages = append(batch.Pages, storage.RowWrite{ID: id, Base: p.version, Removed: true})
	}
	for id, f := range h.folders {
		if id != storage.HomeID {
			batch.Folders = append(batch.Folders, storage.RowWrite{ID: id, Base: f.version, Removed: true})
		}
	}
	home := storage.HomeBody(nil)
	homeVersion := h.folders[storage.HomeID].version
	batch.Folders = append(batch.Folders, storage.RowWrite{ID: storage.HomeID, Body: home, Base: homeVersion})
	for id := range h.places {
		batch.Entries = append(batch.Entries, storage.EntryPut{ID: id})
	}
	batch.RemovedBooks = slices.Clone(h.order)
	batch.AIEditTickets = json.RawMessage("[]")
	for page := range h.annotations {
		batch.Annotations = append(batch.Annotations, storage.PageBody{Page: page, Body: json.RawMessage("[]")})
	}
	if err := h.store.Apply(batch); err != nil {
		return err
	}
	h.pages = map[string]row{}
	h.folders = map[string]folderRow{storage.HomeID: newFolderRow(home, homeVersion+1)}
	h.places = map[string]string{}
	h.books = map[string]entry{}
	h.order = nil
	h.annotations = map[string]json.RawMessage{}
	h.aiEditTickets = nil
	h.touched = map[string]string{}
	h.bookWarnings = map[string]engine.BookWarning{}
	h.pageWarnings = map[string]engine.BookWarning{}
	h.annotationWarnings = nil
	return nil
}
