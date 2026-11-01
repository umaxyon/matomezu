//go:build e2e

// e2e の常駐のテストの用意（booksForTest・putBookForTest は books_for_test_test.go と同じ物。go test はタグを付けずに流すので、そちらにも置く）

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
