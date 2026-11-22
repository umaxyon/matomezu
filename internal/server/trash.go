package server

// ゴミ箱: 書庫の一番上のフォルダの 1 つ（フォルダの行 library-trash。storage/library.go）。ゴミ箱の中の物は、上へたどってゴミ箱に着くエントリ
// （フォルダごと入れたなら、その中のブックとページも中）。入れる・戻す・消すはアクションで行う。
// ゴミ箱の中のブックは、AI の MCP 公開ツール（list_books・read_book・read_page・view・show など）と、AI に見せるアノテーションには出さない。
// ゴミ箱と、ゴミ箱の中のフォルダ・ページ・バインダも、AI の MCP 公開ツール（read_folder・read_page）に出さない。
// AI のアクションが、どこかの窓に出ているステージエントリ（ブックか、ブックの外のページ・バインダ。コントロールセンターの後ろに隠れているブックスクリーンが開いている物も）をゴミ箱に入れるなら、何も変えずに断る（open-on-screen）

import (
	"slices"

	"github.com/umaxyon/matomezu/internal/storage"
)

// inTrash は、エントリ id が、ゴミ箱の中（何段下でも）に在るか。ゴミ箱そのものは中でない（h.mu を持って呼ぶ）
func (h *Hub) inTrash(id string) bool {
	return slices.Contains(h.foldersAbove(id), storage.TrashID)
}

// trashesShown は、新しくゴミ箱に入るステージエントリ（ブックか、ブックの外のページ・バインダ）ids が、どこかの窓に出ているか（h.mu を持って呼ぶ）
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
	delete(h.touched, id)
	h.order = slices.DeleteFunc(h.order, func(x string) bool { return x == id })
}
