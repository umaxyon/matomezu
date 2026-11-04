//go:build !e2e

// Go のテストの用意（booksForTest・resetForTest とその Hub のメソッドは books_for_test_e2e.go と同じ物）

package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/umaxyon/matomezu/internal/engine"
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
		version, have, err := o.Hub.putBookForTest(head.ID, req.Book, req.Base)
		if errors.Is(err, storage.ErrConflict) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(have)
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
			Books []json.RawMessage `json:"books"`
		}
		if !readJSON(w, r, &req) {
			return
		}
		if err := o.Hub.resetForTest(req.Books); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{})
	}
}

// putBookForTest はブックを丸ごと置き、画面に知らせる（置いてある版が base のときだけ書く）。アクションを通さない
func (h *Hub) putBookForTest(id string, body json.RawMessage, base int64) (int64, *storage.Book, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	found, err := h.engine.CheckBooks([]json.RawMessage{body})
	if err != nil {
		return 0, nil, err
	}
	version, have, err := h.store.PutBook(id, body, base)
	if err != nil {
		return 0, have, err
	}
	if _, ok := h.books[id]; !ok {
		h.order = append(h.order, id)
	}
	h.books[id] = entry{body, version, trashed(body)}
	h.broadcast("book", map[string]any{"book": body, "version": version})
	h.touch(id, stamp())
	h.recordWarnings([]string{id}, found)
	return version, nil, nil
}

// resetForTest は、置き場所と世界を空にしてから books を置く（置き場所のブック・開いた時刻・アノテーション・設定も消す。つないでいる画面と追加プラグインはそのまま。画面には知らせないので、テストは開き直す）
func (h *Hub) resetForTest(books []json.RawMessage) error {
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
	for _, id := range h.order {
		if err := h.store.DeleteBook(id); err != nil {
			return err
		}
	}
	if err := h.store.PutSettings(user, json.RawMessage("null")); err != nil {
		return err
	}
	h.books = map[string]entry{}
	h.order = nil
	h.settings = nil
	h.annotations = map[string]json.RawMessage{}
	h.touched = map[string]string{}
	h.performed = map[string]Performed{}
	h.performedOrder = nil
	h.bookWarnings = map[string]engine.BookWarning{}
	h.annotationWarnings = nil
	for i, body := range books {
		version, _, err := h.store.PutBook(ids[i], body, 0)
		if err != nil {
			return err
		}
		h.books[ids[i]] = entry{body, version, trashed(body)}
		h.order = append(h.order, ids[i])
	}
	return h.checkBooks(h.order)
}
