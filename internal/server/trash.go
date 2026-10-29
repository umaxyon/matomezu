package server

// ゴミ箱: ゴミ箱のブックは、土台のフィールド trashed（入れた時刻）を持つブック。入れる・戻す・消すはアクションで行い、置き場所にはほかのブックと同じに残す。
// ゴミ箱のブックは、AI の読む口（list_books・read_book・show）には出さない。
// AI のアクションが、どこかの窓に出ているブックをゴミ箱に入れるなら、何も変えずに断る（open-on-screen）

import (
	"encoding/json"
	"slices"
)

// trashed は、ブックのデータ body がゴミ箱のブックか
func trashed(body json.RawMessage) bool {
	var head struct {
		Trashed string `json:"trashed"`
	}
	_ = json.Unmarshal(body, &head)
	return head.Trashed != ""
}

// trashesShown は、アクションが返したブック bodies のうち、新しくゴミ箱に入るブックが、どこかの窓に出ているか（h.mu を持って呼ぶ）
func (h *Hub) trashesShown(bodies []json.RawMessage) bool {
	for _, body := range bodies {
		var head struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(body, &head)
		if !trashed(body) || trashed(h.books[head.ID].body) {
			continue
		}
		for _, c := range h.clients {
			if slices.Contains(c.shown, head.ID) {
				return true
			}
		}
	}
	return false
}

// remove は、アクションが一覧から消したブック id を置き場所から消して知らせる（h.mu を持って呼ぶ）
func (h *Hub) remove(id, client string, seq int64) error {
	if _, ok := h.books[id]; !ok {
		return nil
	}
	if err := h.store.DeleteBook(id); err != nil {
		return err
	}
	delete(h.books, id)
	delete(h.bookWarnings, id)
	delete(h.touched, id)
	h.order = slices.DeleteFunc(h.order, func(x string) bool { return x == id })
	h.broadcast("removed", map[string]any{"book": id, "client": client, "seq": seq})
	return nil
}
