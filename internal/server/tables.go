package server

// ページとフォルダの表: 常駐が持つブックのデータは、ページ 1 枚ずつとフォルダ 1 つずつ（置き場所と同じ単位。版もそれぞれが持つ）。
// フォルダは、書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ（storage/library.go）。どれもエントリ（ページ・バインダ・ブック・フォルダ）の id を順に持つ。
// エントリの入っているフォルダは places にも持つ（ページから持ち主のブックを引くのに使う）。
// ブックの本文（並びにページとバインダの中身ごと持つ形）が要る所（AI に見せる・エンジンに確かめさせる）には、ここで組んだ物を渡す（books。変わったブックだけ組み直す）。
// 組むのは形だけ: フォルダの lineup のうち、id だけのエントリ（kind と id だけを持つ）を、表の中身に替える（core/folders-unreadable.ts の rawBooksOf と同じ決まり）。
// ブックは、役（folderRole）が home・trash・folder・binder のどれでもないフォルダ（形の壊れた物も、読めないブックとして 1 冊に数える）

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"
	"strconv"

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

// isOpen は、フォルダの行が、ページ・バインダ・ブック・フォルダの 4 つとも持てる役（書庫ホーム・ゴミ箱・フォルダ。storage.IsOpenRole）か
func (f folderRow) isOpen() bool { return storage.IsOpenRole(f.role) }

// entryRef は、役 role のフォルダの lineup の要素 entry が指すエントリの kind と id（指していなければ ok が false）。
// ゴミ箱の要素は、kind と id を読み、ほかのキー（trashed・from）は読まない。ほかの役の要素は、id だけのエントリ（kind と id だけを持つ）だけが指す
// （それより多くを持つ要素は、中身ごと残っている物）
func entryRef(role string, entry json.RawMessage) (kind, id string, ok bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(entry, &fields) != nil {
		return "", "", false
	}
	// 読めない物のフォルダの要素は、在った所の並びのエントリ entry を持つ
	if role == storage.RoleUnreadable {
		if inner, ok := fields["entry"]; ok {
			return entryRef(storage.RoleTrash, inner)
		}
		return "", "", false
	}
	if role != storage.RoleTrash && len(fields) != 2 {
		return "", "", false
	}
	if json.Unmarshal(fields["kind"], &kind) != nil || json.Unmarshal(fields["id"], &id) != nil || id == "" {
		return "", "", false
	}
	return kind, id, kind == storage.KindPage || kind == storage.KindBinder || kind == storage.KindBook || kind == storage.KindFolder
}

// newFolderRow は、フォルダの本文 body を覚える形にする
func newFolderRow(body json.RawMessage, version int64) folderRow {
	f := folderRow{row: row{body, version}, role: storage.RoleOf(body)}
	for _, e := range lineupOf(body) {
		if _, id, ok := entryRef(f.role, e); ok {
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
		fields["kind"] = json.RawMessage(strconv.Quote(storage.KindBinder))
	}
	var lineup []json.RawMessage
	if raw, has := fields["lineup"]; has && json.Unmarshal(raw, &lineup) == nil {
		parts := make([]json.RawMessage, 0, len(lineup))
		for _, e := range lineup {
			kind, entry, isRef := entryRef(f.role, e)
			switch {
			case isRef && kind == storage.KindPage:
				if p, ok := h.pages[entry]; ok {
					e = p.body
				}
			case isRef && kind == storage.KindBinder:
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

// foldersAbove は、エントリ id が入っているフォルダから上へ、書庫の一番上（書庫ホームかゴミ箱）までの id（近い順。表に無いフォルダで止める。輪になっていれば、通ったフォルダで止める。h.mu を持って呼ぶ）
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
	holdLine(&h.libraryWarning, line)
}

// openIDs は、書庫ホーム・ゴミ箱・フォルダの id の全部（書庫ホームを先に、ゴミ箱を次に、ほかは id の順。h.mu を持って呼ぶ）
func (h *Hub) openIDs() []string {
	out := []string{}
	for _, id := range []string{storage.HomeID, storage.TrashID} {
		if f, ok := h.folders[id]; ok && f.isOpen() {
			out = append(out, id)
		}
	}
	for _, id := range slices.Sorted(maps.Keys(h.folders)) {
		if id != storage.HomeID && id != storage.TrashID && h.folders[id].isOpen() {
			out = append(out, id)
		}
	}
	return out
}

// openRows は、書庫ホーム・ゴミ箱・フォルダの行の全部（openIDs の順。エンジンに渡す。h.mu を持って呼ぶ）
func (h *Hub) openRows() []json.RawMessage {
	out := []json.RawMessage{}
	for _, id := range h.openIDs() {
		out = append(out, h.folders[id].body)
	}
	return out
}

// entriesNotInBooks は、書庫ホーム・ゴミ箱・フォルダの直下に在るページとバインダの id の全部（ブックに入っていない物。openIDs の順、その中は並びの順。h.mu を持って呼ぶ）
func (h *Hub) entriesNotInBooks() []string {
	out := []string{}
	for _, id := range h.openIDs() {
		for _, e := range h.folders[id].entries {
			if _, page := h.pages[e]; page || h.folders[e].role == storage.RoleBinder {
				out = append(out, e)
			}
		}
	}
	return out
}

// entryNotInBook は、ブックに入っていないページ page の行をエンジンへ渡すときの、渡すエントリの id: 書庫ホームかフォルダの直下のページならそのページ、
// その直下のバインダの中のページならそのバインダ。ブックの中・ゴミ箱の中・どのフォルダにも入っていない・無いページなら空（h.mu を持って呼ぶ）
func (h *Hub) entryNotInBook(page string) string {
	if _, ok := h.pages[page]; !ok || h.outOfSight(page) || h.bookOfEntry(page) != "" {
		return ""
	}
	holder, ok := h.folders[h.places[page]]
	switch {
	case ok && holder.role == storage.RoleBinder:
		return h.places[page]
	case ok && holder.isOpen():
		return page
	}
	return ""
}

// openRowsAbove は、ブック ids から書庫の一番上（書庫ホームか、ゴミ箱の中のブックならゴミ箱）までの、書庫ホーム・ゴミ箱・フォルダの行
// （ブックごとに近い順。重ねない。エンジンに渡す。h.mu を持って呼ぶ）
func (h *Hub) openRowsAbove(ids []string) []json.RawMessage {
	out := []json.RawMessage{}
	seen := map[string]bool{}
	for _, id := range ids {
		for _, at := range h.foldersAbove(id) {
			if f := h.folders[at]; f.isOpen() && !seen[at] {
				seen[at] = true
				out = append(out, f.body)
			}
		}
	}
	return out
}

// neighborRows は、エントリ ids のそれぞれと同じ書庫ホーム・フォルダに直に入っている、ほかのエントリの行の本文（ページの行と、フォルダの行。
// 中へは降りない。もう渡す物 passed・passed から書庫の一番上までのフォルダ（openRowsAbove が渡す）と、ゴミ箱に直に入っている物の隣は入れない。重ねない。エンジンが、同じフォルダの中の名前の重なりを確かめるのに使う。
// h.mu を持って呼ぶ）
func (h *Hub) neighborRows(ids, passed []string) (pages, folders []json.RawMessage) {
	pages, folders = []json.RawMessage{}, []json.RawMessage{}
	seen := map[string]bool{}
	for _, id := range passed {
		seen[id] = true
		for _, above := range h.foldersAbove(id) {
			seen[above] = true
		}
	}
	for _, id := range ids {
		holder, ok := h.folders[h.places[id]]
		if !ok || !holder.isOpen() || h.places[id] == storage.TrashID {
			continue
		}
		for _, e := range holder.entries {
			if seen[e] {
				continue
			}
			seen[e] = true
			if p, page := h.pages[e]; page {
				pages = append(pages, p.body)
			} else if f, folder := h.folders[e]; folder {
				folders = append(folders, f.body)
			}
		}
	}
	return pages, folders
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
		} else if inner.role == storage.RoleBinder {
			out = append(out, h.rowsUnder(e)...)
		}
	}
	return out
}

// rowsOf は、ブック・バインダ・ページ ids のページとフォルダの本文（エンジンに渡す。ページならその行。ブックとバインダなら、そのフォルダ・その下のバインダ・その中のページ。
// バインダでないフォルダの中へは降りない。h.mu を持って呼ぶ）
func (h *Hub) rowsOf(ids []string) (pages, folders []json.RawMessage) {
	pages, folders = []json.RawMessage{}, []json.RawMessage{}
	var walk func(id string)
	walk = func(id string) {
		if p, ok := h.pages[id]; ok {
			pages = append(pages, p.body)
			return
		}
		f, ok := h.folders[id]
		if !ok {
			return
		}
		folders = append(folders, f.body)
		for _, e := range f.entries {
			if _, page := h.pages[e]; page || h.folders[e].role == storage.RoleBinder {
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

// Tables は、全部のページとフォルダ（版つき。ゴミ箱の中の分も。id の順）
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
