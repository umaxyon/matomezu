//go:build e2e

// e2e の常駐のテストの用意（booksForTest・resetForTest・enablePluginsForTest・enabledPluginsSetting・joinedAIForTest と、ブックを丸ごと置き換える・全部を消す Hub のメソッド（replaceBookForTest・clearBooksForTest など）は books_for_test_test.go と同じ物。go test はタグを付けずに流すので、そちらにも置く）

package server

import (
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// routesForTest は、テストの用意の HTTP のパスを足す（本番の実行ファイルでは routes_off.go の空の関数）
func routesForTest(mux *http.ServeMux, o Options) {
	mux.Handle("PUT /api/books-for-test/{id}", sameOrigin(booksForTest(o)))
	mux.Handle("GET /api/books-for-test", sameOrigin(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"books": o.Hub.assembledBooksForTest()})
	}))
	mux.Handle("POST /api/reset-for-test", sameOrigin(resetForTest(o)))
	mux.Handle("POST /api/enable-plugins-for-test", sameOrigin(enablePluginsForTest(o)))
	mux.Handle("POST /api/joined-ai-for-test", sameOrigin(func(w http.ResponseWriter, _ *http.Request) {
		id, err := o.Hub.joinedAIForTest()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"participant": id})
	}))
	mux.Handle("POST /api/cookie-code-for-test", sameOrigin(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"code": o.Cookies.NewCode()})
	}))
}

// booksForTest は、PUT /api/books-for-test/{id}（ブックを丸ごと置く。アクションも認可も通さない、テストの用意だけの入口）の処理
func booksForTest(o Options) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Book json.RawMessage `json:"book"`
			Base int64           `json:"base"`
		}
		if !readJSON(w, r, &req) {
			return
		}
		var head struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(req.Book, &head) != nil || head.ID != r.PathValue("id") {
			http.Error(w, "the book must be an object with the id of the path", http.StatusBadRequest)
			return
		}
		version, conflict, err := o.Hub.putBookForTest(head.ID, req.Book, req.Base)
		if conflict {
			http.Error(w, "the book was changed by someone else", http.StatusConflict)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"version": version})
	}
}

// resetForTest は、POST /api/reset-for-test（{books, enabledPlugins}。置いてある物を全部消し、books を並びの順に置く。足した追加プラグインのうち enabledPlugins の物だけを有効にする。アクションも認可も通さない、テストの用意だけの入口）の処理
func resetForTest(o Options) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Books          []json.RawMessage `json:"books"`
			OutsidePages   []json.RawMessage `json:"outsidePages"`
			EnabledPlugins []string          `json:"enabledPlugins"`
		}
		if !readJSON(w, r, &req) {
			return
		}
		if err := o.Hub.resetForTest(req.Books, req.OutsidePages, req.EnabledPlugins); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{})
	}
}

// assembledBooksForTest は、置いてあるブックの全部（ゴミ箱のブックも）を、並びにページとバインダの中身ごと持つ形に組んで、置いた順に返す（テストが、置いてある物を確かめる入口）
func (h *Hub) assembledBooksForTest() []json.RawMessage {
	h.mu.Lock()
	defer h.mu.Unlock()
	books := make([]json.RawMessage, 0, len(h.order))
	for _, id := range h.order {
		books = append(books, h.books[id].body)
	}
	return books
}

// putBookForTest はブックを丸ごと置き、窓に知らせる（置いてある版が base のときだけ書く。違えば conflict）。アクションを通さない
func (h *Hub) putBookForTest(id string, body json.RawMessage, base int64) (version int64, conflict bool, err error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	version, conflict, err = h.replaceBookForTest(id, body, base)
	if err == nil && !conflict {
		// 置いた世界の読めない物を移す（窓には、移した行を知らせる）
		h.settleLibrary(false)
	}
	return version, conflict, err
}

// resetForTest は、置き場所と世界を空にしてから books を置く（置き場所のブック・開いた時刻・アノテーション・設定・レコード（郵便も）も消す。つないでいる窓と追加プラグインはそのまま。窓には知らせないので、テストは開き直す）
func (h *Hub) resetForTest(books, outsidePages []json.RawMessage, enabledPlugins []string) error {
	ids := make([]string, len(books))
	for i, body := range books {
		var head struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(body, &head) != nil || head.ID == "" {
			return errors.New("each book must be an object with an id")
		}
		ids[i] = head.ID
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := h.clearBooksForTest(); err != nil {
		return err
	}
	settings := json.RawMessage("null")
	if len(enabledPlugins) > 0 {
		list, _ := json.Marshal(enabledPlugins)
		settings = json.RawMessage(`{"` + enabledPluginsSetting + `":` + string(list) + `}`)
	}
	if err := h.store.Apply(storage.Batch{Settings: &storage.UserBody{User: user, Body: settings}}); err != nil {
		return err
	}
	if err := h.resetRecordsForTest(); err != nil {
		return err
	}
	if err := h.store.PutParticipantNotes(user, json.RawMessage("{}")); err != nil {
		return err
	}
	h.settings = nil
	if len(enabledPlugins) > 0 {
		h.settings = settings
	}
	h.reusePluginsForSettings("")
	h.participantNotes = map[string]participantNote{}
	h.performed = map[string]Performed{}
	h.performedOrder = nil
	for i, body := range books {
		if _, _, err := h.replaceBookQuietlyForTest(ids[i], body, 0); err != nil {
			return err
		}
	}
	if err := h.putOutsidePagesForTest(outsidePages); err != nil {
		return err
	}
	h.settleLibrary(true)
	return h.checkBooks(h.order)
}

// putOutsidePagesForTest は、ブックの外のページ pages（id を持つページの行。kind が binder の物は、中のページを lineup に持つブックの外のバインダ）を、書庫ホームの並びの末尾に置く（窓には知らせない。ブックの外のページを作るテストの用意。h.mu を持って呼ぶ）
func (h *Hub) putOutsidePagesForTest(pages []json.RawMessage) error {
	if len(pages) == 0 {
		return nil
	}
	var out engine.Output
	refs := make([]json.RawMessage, len(pages))
	for i, body := range pages {
		var head struct {
			Kind     string            `json:"kind"`
			ID       string            `json:"id"`
			Title    string            `json:"title"`
			PageType string            `json:"pageType"`
			Lineup   []json.RawMessage `json:"lineup"`
		}
		if json.Unmarshal(body, &head) != nil || head.ID == "" {
			return errors.New("each outside page must be an object with an id")
		}
		if head.Kind != storage.KindBinder {
			refs[i] = storage.RefOf(storage.KindPage, head.ID)
			out.Pages = append(out.Pages, engine.RowChange{ID: head.ID, Row: body})
			continue
		}
		// バインダは、中のページの行と、バインダの行に分けて置く
		inside := make([]json.RawMessage, len(head.Lineup))
		for k, page := range head.Lineup {
			var row struct {
				ID string `json:"id"`
			}
			if json.Unmarshal(page, &row) != nil || row.ID == "" {
				return errors.New("each page in an outside binder must be an object with an id")
			}
			inside[k] = storage.RefOf(storage.KindPage, row.ID)
			out.Pages = append(out.Pages, engine.RowChange{ID: row.ID, Row: page})
		}
		binder, err := json.Marshal(map[string]any{
			"folderRole": storage.RoleBinder, "id": head.ID, "title": head.Title, "pageType": head.PageType, "lineup": inside,
		})
		if err != nil {
			return err
		}
		refs[i] = storage.RefOf(storage.KindBinder, head.ID)
		out.Folders = append(out.Folders, engine.RowChange{ID: head.ID, Row: binder})
	}
	home, err := h.homeWithForTest(func(lineup []json.RawMessage) []json.RawMessage { return append(lineup, refs...) })
	if err != nil {
		return err
	}
	out.Folders = append(out.Folders, engine.RowChange{ID: storage.HomeID, Row: home})
	plan, err := h.planWrites(out, "host", "", stamp())
	if err != nil {
		return err
	}
	plan.quiet = true
	if err := h.store.Apply(plan.batch); err != nil {
		return err
	}
	h.applyWrites(plan, out, Perform{}, "host", "")
	return nil
}

// joinedAIForTest は、参加が確定した AI の参加者（受け入れ済みで準備中でない）を、ワークルームと一緒に 1 人置く（まだ無ければ。アクションも郵便も通さない）。参加の id を返す。
// AI はアクションを、参加が確定してワークルームに入るまで使えないので、AI の入口を使うテストの用意に使う
func (h *Hub) joinedAIForTest() (string, error) {
	const id = "e2e-ai"
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.recordTables[h.roles["participants"]][id]; ok {
		return id, nil
	}
	now := stamp()
	room, err := json.Marshal(map[string]any{"id": "e2e-room", "name": "e2e", "bird": "inko", "createdAt": now})
	if err != nil {
		return "", err
	}
	who, err := json.Marshal(map[string]any{
		"id": id, "state": "joined", "ai": "claude", "model": "e2e", "env": "e2e", "sessionName": "", "link": id,
		"workroom": "e2e-room", "requestedAt": now, "joinedAt": now,
	})
	if err != nil {
		return "", err
	}
	writes := []storage.RecordWrite{
		{Subject: h.roles["workrooms"], ID: "e2e-room", Body: room},
		{Subject: h.roles["participants"], ID: id, Body: who},
	}
	if err := h.store.Apply(storage.Batch{Records: writes}); err != nil {
		return "", err
	}
	changes := make([]map[string]any, 0, len(writes))
	for _, w := range writes {
		if h.recordTables[w.Subject] == nil {
			h.recordTables[w.Subject] = map[string]recordEntry{}
		}
		h.recordTables[w.Subject][w.ID] = recordEntry{w.Body, 1}
		changes = append(changes, map[string]any{"subject": w.Subject, "id": w.ID, "record": json.RawMessage(w.Body), "version": 1})
	}
	h.broadcast("changed", map[string]any{"pages": []any{}, "folders": []any{}, "books": []any{}, "records": changes})
	h.participantNotes[id] = participantNote{SessionID: id, BoundBy: boundByJoin}
	if err := h.putParticipantNotes(); err != nil {
		return "", err
	}
	return id, nil
}

// resetRecordsForTest は、レコードと番号の表を空にする（置き場所もメモリも。窓には知らせない）。h.mu を持って呼ぶ
func (h *Hub) resetRecordsForTest() error {
	var batch storage.Batch
	for subject, table := range h.recordTables {
		for id, e := range table {
			batch.Records = append(batch.Records, storage.RecordWrite{Subject: subject, ID: id, Base: e.version, Removed: true})
		}
	}
	for subject, table := range h.counters {
		for scope := range table {
			batch.Counters = append(batch.Counters, storage.Counter{Subject: subject, Scope: scope, Next: 1})
		}
	}
	if err := h.store.Apply(batch); err != nil {
		return err
	}
	h.recordTables = map[string]map[string]recordEntry{}
	h.counters = map[string]map[string]int64{}
	h.recordLines = map[recordKey][]string{}
	return nil
}

// enablePluginsForTest は、POST /api/enable-plugins-for-test（{ids}。足した追加プラグインのうち ids の物だけを有効にして、エンジンを組み直し、窓に知らせる。テストの用意だけの入口）の処理
func enablePluginsForTest(o Options) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			IDs []string `json:"ids"`
		}
		if !readJSON(w, r, &req) {
			return
		}
		if err := o.Hub.enablePluginsForTest(req.IDs); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{})
	}
}

// enablePluginsForTest は、足した追加プラグインのうち ids の物だけを有効にする設定を残し、エンジンを組み直す
func (h *Hub) enablePluginsForTest(ids []string) error {
	list, _ := json.Marshal(ids)
	settings := json.RawMessage(`{"` + enabledPluginsSetting + `":` + string(list) + `}`)
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := h.store.Apply(storage.Batch{Settings: &storage.UserBody{User: user, Body: settings}}); err != nil {
		return err
	}
	h.settings = settings
	h.reusePluginsForSettings("")
	return nil
}

// enabledPluginsSetting は、有効にした追加プラグインの id の並びを持つ利用者の設定の項目（テストの用意が書くのに使う。エンジンが role で読む）
const enabledPluginsSetting = "@matomezu/base:enabled-plugins"

// replaceBookForTest は、ブック id を本文 body（並びにページとバインダの中身ごと持つ形）に丸ごと置き換えて、窓に知らせる（アクションも認可も通さない。ブックを丸ごと受け取る、テストの用意の入口が使う）。
// 置いてあるブックのフォルダの版が base のときだけ（まだ無ければ base は 0）で、違えば conflict。本文は置き場所の決まり（storage.SplitBook）で分け、分けられない本文は、そのままフォルダの 1 行にする。
// まだどのフォルダにも入っていないブックは、書庫ホームの並びの末尾に足す。
// 返すのは、書いた後のブックのフォルダの版（h.mu を持って呼ぶ）
func (h *Hub) replaceBookForTest(id string, body json.RawMessage, base int64) (version int64, conflict bool, err error) {
	return h.putWholeBookForTest(id, body, base, false)
}

// replaceBookQuietlyForTest は replaceBookForTest と同じに置き換えるが、窓に知らせず、触れた時刻も残さない（世界を空にして置き直す、テストの用意の入口が使う。h.mu を持って呼ぶ）
func (h *Hub) replaceBookQuietlyForTest(id string, body json.RawMessage, base int64) (version int64, conflict bool, err error) {
	return h.putWholeBookForTest(id, body, base, true)
}

func (h *Hub) putWholeBookForTest(id string, body json.RawMessage, base int64, quiet bool) (version int64, conflict bool, err error) {
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
		home, err := h.homeWithForTest(func(lineup []json.RawMessage) []json.RawMessage {
			return append(lineup, storage.RefOf(storage.KindBook, id))
		})
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

// homeWithForTest は、書庫ホームの並びを change で替えた本文（書庫ホームが無ければ、空の並びから作る。h.mu を持って呼ぶ。何も変えない）
func (h *Hub) homeWithForTest(change func([]json.RawMessage) []json.RawMessage) (json.RawMessage, error) {
	f, ok := h.folders[storage.HomeID]
	if !ok {
		return storage.HomeBody(change(nil)), nil
	}
	return withLineup(f.body, change(slices.Clone(lineupOf(f.body))))
}

// clearBooksForTest は、全部のブック（ページとフォルダとエントリ、開いた時刻、AI 編集チケット、ページのアノテーション）を、置き場所とメモリから消す。
// 書庫ホームとゴミ箱は残して、並びを空にする（窓には知らせない。テストの用意が使う。h.mu を持って呼ぶ）
func (h *Hub) clearBooksForTest() error {
	var batch storage.Batch
	for id, p := range h.pages {
		batch.Pages = append(batch.Pages, storage.RowWrite{ID: id, Base: p.version, Removed: true})
	}
	for id, f := range h.folders {
		if id != storage.HomeID && id != storage.TrashID && id != storage.UnreadableID {
			batch.Folders = append(batch.Folders, storage.RowWrite{ID: id, Base: f.version, Removed: true})
		}
	}
	home, trash, unreadable := storage.HomeBody(nil), storage.TrashBody(nil), storage.UnreadableBody(nil)
	homeVersion, trashVersion := h.folders[storage.HomeID].version, h.folders[storage.TrashID].version
	unreadableVersion := h.folders[storage.UnreadableID].version
	batch.Folders = append(batch.Folders, storage.RowWrite{ID: storage.HomeID, Body: home, Base: homeVersion},
		storage.RowWrite{ID: storage.TrashID, Body: trash, Base: trashVersion},
		storage.RowWrite{ID: storage.UnreadableID, Body: unreadable, Base: unreadableVersion})
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
	h.folders = map[string]folderRow{storage.HomeID: newFolderRow(home, homeVersion+1), storage.TrashID: newFolderRow(trash, trashVersion+1),
		storage.UnreadableID: newFolderRow(unreadable, unreadableVersion+1)}
	h.unreadableWarning = ""
	h.places = map[string]string{}
	h.books = map[string]entry{}
	h.order = nil
	h.annotations = map[string]json.RawMessage{}
	h.aiEditTickets = nil
	h.touched = map[string]string{}
	h.bookWarnings = map[string]engine.BookWarning{}
	h.pageWarnings = map[string]string{}
	h.annotationWarnings = nil
	return nil
}
