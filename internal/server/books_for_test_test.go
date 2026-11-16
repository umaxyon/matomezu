//go:build !e2e

// Go のテストの用意（booksForTest・resetForTest・enablePluginsForTest・enabledPluginsSetting とその Hub のメソッドは books_for_test_e2e.go と同じ物）

package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/umaxyon/matomezu/internal/storage"
)

// withRoutesForTest は、h にテストの用意の HTTP のパスを足した入口（本番の Handler には足されないので、Go のテストで包む）
func withRoutesForTest(h http.Handler, o Options) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("PUT /api/books-for-test/{id}", sameOrigin(booksForTest(o)))
	mux.Handle("POST /api/reset-for-test", sameOrigin(resetForTest(o)))
	mux.Handle("/", h)
	return mux
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

// resetForTest は、POST /api/reset-for-test（{books}。置いてある物を全部消し、books を並びの順に置く。アクションも認可も通さない、テストの用意だけの入口）の処理
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

// putBookForTest はブックを丸ごと置き、窓に知らせる（置いてある版が base のときだけ書く。違えば conflict）。アクションを通さない
func (h *Hub) putBookForTest(id string, body json.RawMessage, base int64) (version int64, conflict bool, err error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.replaceBook(id, body, base)
}

// resetForTest は、置き場所と世界を空にしてから books を置く（置き場所のブック・開いた時刻・アノテーション・設定・レコード（郵便も）も消す。つないでいる画面と追加プラグインはそのまま。画面には知らせないので、テストは開き直す）
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
	h.mu.Lock()
	defer h.mu.Unlock()
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
