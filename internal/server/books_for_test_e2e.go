//go:build e2e

// e2e の常駐のテストの用意（booksForTest・resetForTest・enablePluginsForTest・enabledPluginsSetting とその Hub のメソッドは books_for_test_test.go と同じ物。go test はタグを付けずに流すので、そちらにも置く）

package server

import (
	"encoding/json"
	"errors"
	"net/http"

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
			EnabledPlugins []string          `json:"enabledPlugins"`
		}
		if !readJSON(w, r, &req) {
			return
		}
		if err := o.Hub.resetForTest(req.Books, req.EnabledPlugins); err != nil {
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
	return h.replaceBook(id, body, base)
}

// resetForTest は、置き場所と世界を空にしてから books を置く（置き場所のブック・開いた時刻・アノテーション・設定・レコード（郵便も）も消す。つないでいる窓と追加プラグインはそのまま。窓には知らせないので、テストは開き直す）
func (h *Hub) resetForTest(books []json.RawMessage, enabledPlugins []string) error {
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
	// 置いたあとに、起動したときと同じく、機能台帳に合わせて足す物（システムフォルダなど）を足す
	defer h.afterCatalogChange()
	h.mu.Lock()
	defer h.mu.Unlock()
	h.catalogChanged = true
	if err := h.clearBooks(); err != nil {
		return err
	}
	settings := json.RawMessage("null")
	if len(enabledPlugins) > 0 {
		list, _ := json.Marshal(enabledPlugins)
		settings = json.RawMessage(`{"` + enabledPluginsSetting + `":` + string(list) + `}`)
	}
	if err := h.store.PutSettings(user, settings); err != nil {
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
	h.reusePluginsForSettings()
	h.participantNotes = map[string]participantNote{}
	h.performed = map[string]Performed{}
	h.performedOrder = nil
	for i, body := range books {
		if _, _, err := h.replaceBookQuietly(ids[i], body, 0); err != nil {
			return err
		}
	}
	return h.checkBooks(h.order)
}

// joinedAIForTest は、参加が確定した AI の参加者（受け入れ済みで準備中でない）を、ワークルームと一緒に 1 人置く（まだ無ければ。アクションも郵便も通さない）。参加の id を返す。
// ブックでない対象のアクションは、参加が確定するまで AI が使えないので、AI の入口を使う e2e の用意に使う
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
	if err := h.store.PutSettings(user, settings); err != nil {
		return err
	}
	h.settings = settings
	h.reusePluginsForSettings()
	return nil
}

// enabledPluginsSetting は、有効にした追加プラグインの id の並びを持つ利用者の設定の項目（テストの用意が書くのに使う。エンジンが role で読む）
const enabledPluginsSetting = "@matomezu/base:enabled-plugins"
