package server

// ゴミ箱: ゴミ箱のブックは、土台のフィールド trashed（入れた時刻）を持つブック。入れる・戻す・消すはアクションで行い、置き場所にはほかのブックと同じに残す。
// ゴミ箱のブックは、AI の MCP 公開ツール（list_books・read_book・show）には出さない。
// AI のアクションが、どこかの窓に出ているブック（コントロールセンターの後ろに隠れているブックスクリーンが開いているブックも）をゴミ箱に入れるなら、何も変えずに断る（open-on-screen）

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

// trashesShown は、新しくゴミ箱に入るブック ids が、どこかの窓に出ているか（h.mu を持って呼ぶ）
func (h *Hub) trashesShown(ids []string) bool {
	for _, id := range ids {
		for _, c := range h.clients {
			if slices.Contains(c.held, id) {
				return true
			}
		}
	}
	return false
}

// dropBook は、置き場所から消し終えたブック id をメモリから外す（ページとフォルダの表と、窓への知らせは、消した側が済ませている。h.mu を持って呼ぶ）
func (h *Hub) dropBook(id string) {
	delete(h.books, id)
	delete(h.bookWarnings, id)
	h.dropPageWarnings(id)
	delete(h.touched, id)
	h.order = slices.DeleteFunc(h.order, func(x string) bool { return x == id })
}
