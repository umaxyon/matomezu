// AI に見せる、形の描いた位置と大きさ（read_book・read_page に添える placed）: ブックのタイプの見せ方の aiPlaced が決める（無ければ添えない）。
// データの位置（子は親の左上から）や w・h（書いていない形、子で大きく描く形がある）と違い、紙の上の左上と、描いた幅・高さ。
// 置いたアイテムで描く見せ方（紙など）は itemAiPlaced を使う: どの深さの形も、置いた順に

import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { allRectsOf } from "./placed"

// 形 1 つの、紙の上の左上と描いた大きさ
export interface AiPlaced {
  id: string
  x: number
  y: number
  w: number
  h: number
}

// AI に見せるために読む、定義オブジェクトのメソッド（定義オブジェクトの拡張ポイントに書き足す）
declare module "../../../core/catalog" {
  interface PresentationExtras {
    // ページ page の形の、描いた位置と大きさ（無ければ添えない）
    aiPlaced?(catalog: CoreCatalog, book: Book, page: ItemPage): readonly AiPlaced[]
  }
}

// 置いたアイテムの、描いた位置と大きさ（どの深さの形も。大きさの分からない形は入れない）
export const itemAiPlaced = (catalog: CoreCatalog, _book: Book, page: ItemPage): AiPlaced[] =>
  [...allRectsOf(catalog, page)].map(([id, r]) => ({ id, x: r.x, y: r.y, w: r.w, h: r.h }))

// ブック book のページごとの、描いた位置と大きさ（ページの id ごと）。見せ方が aiPlaced を持たないか、ページの無いブックなら null
export function aiPlacedOf(catalog: CoreCatalog, book: Book): Record<string, readonly AiPlaced[]> | null {
  const aiPlaced = catalog.presentations.get(bookType(catalog, book.type).presentation)?.aiPlaced
  if (!aiPlaced || !hasPages(book)) return null
  return Object.fromEntries((book.pages as readonly ItemPage[]).map(p => [p.id, aiPlaced(catalog, book, p)]))
}
