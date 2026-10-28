package server

// ゴミ箱: アクションが一覧から外したブック（エンジンの Removed）は、置き場所でゴミ箱に入れる（入れた時刻を残す）。
// 戻す・消す・空にするのは利用者だけで、画面の口（/api/trash/...）からだけ行う。ゴミ箱が変わったら画面に知らせる（trash）。
// AI のアクションが、どこかの窓に出ているブックを外すなら、何も変えずに断る（open-on-screen）

import (
	"encoding/json"
	"errors"
	"slices"

	"github.com/umaxyon/matomezu/internal/storage"
)

// TrashEntry はゴミ箱のブック 1 冊（画面の一覧に出す物）
type TrashEntry struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Title string `json:"title"`
	At    string `json:"at"`
}

// ErrNotTrashed は、ゴミ箱にそのブックが無いこと
var ErrNotTrashed = storage.ErrNotTrashed

// shownSomewhere は、ブック ids のどれかが、どこかの窓に出ているか（h.mu を持って呼ぶ）
func (h *Hub) shownSomewhere(ids []string) bool {
	for _, c := range h.clients {
		for _, id := range ids {
			if slices.Contains(c.shown, id) {
				return true
			}
		}
	}
	return false
}

// trash は、アクションが一覧から外したブック id をゴミ箱に入れて知らせる（h.mu を持って呼ぶ）
func (h *Hub) trash(id, at, client string, seq int64) error {
	if _, ok := h.books[id]; !ok {
		return nil
	}
	if err := h.store.Trash(id, at); err != nil {
		return err
	}
	delete(h.books, id)
	delete(h.bookWarnings, id)
	h.order = slices.DeleteFunc(h.order, func(x string) bool { return x == id })
	h.broadcast("removed", map[string]any{"book": id, "client": client, "seq": seq})
	return nil
}

// trashList はゴミ箱の一覧（h.mu を持って呼ぶ）
func (h *Hub) trashList() ([]TrashEntry, error) {
	books, err := h.store.TrashedBooks()
	if err != nil {
		return nil, err
	}
	out := make([]TrashEntry, 0, len(books))
	for _, b := range books {
		var head struct {
			Type  string `json:"type"`
			Title string `json:"title"`
		}
		_ = json.Unmarshal(b.Body, &head)
		out = append(out, TrashEntry{ID: b.ID, Type: head.Type, Title: head.Title, At: b.At})
	}
	return out, nil
}

// tellTrash は、ゴミ箱の一覧を全部の画面に知らせる（h.mu を持って呼ぶ）
func (h *Hub) tellTrash() error {
	list, err := h.trashList()
	if err != nil {
		return err
	}
	h.broadcast("trash", map[string]any{"trash": list})
	return nil
}

// Trash はゴミ箱の一覧
func (h *Hub) Trash() ([]TrashEntry, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.trashList()
}

// Restore は、ゴミ箱のブック id を一覧に戻して知らせる（ゴミ箱に無ければ ErrNotTrashed）
func (h *Hub) Restore(id string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	b, err := h.store.Restore(id)
	if err != nil {
		return err
	}
	h.books[id] = entry{b.Body, b.Version}
	h.order = append(h.order, id)
	h.broadcast("book", map[string]any{"book": b.Body, "version": b.Version})
	if err := h.checkBooks([]string{id}); err != nil {
		return err
	}
	return h.tellTrash()
}

// Purge は、ゴミ箱のブック ids を消して知らせる（戻せない）。ids が空ならゴミ箱を空にする。ゴミ箱に無いブックは飛ばす
func (h *Hub) Purge(ids []string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(ids) == 0 {
		list, err := h.trashList()
		if err != nil {
			return err
		}
		for _, t := range list {
			ids = append(ids, t.ID)
		}
	}
	for _, id := range ids {
		if err := h.store.Purge(id); err != nil && !errors.Is(err, ErrNotTrashed) {
			return err
		}
		delete(h.touched, id)
	}
	return h.tellTrash()
}
