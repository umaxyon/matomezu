// 図面のページに置いたアイテムの読み方: 置いたデータの外枠と、形が変わったあとの整え・関係の決まりは土台（core/placed.ts・core/place/items.ts）。
// ここは、図面のページの型と、ページの線の読み出し
import type { PagedBook } from "../../../core/book"
import { connectorsOf, type ItemPage, type PlacedItem, type PlacedShape } from "../../../core/placed"
import { LINE } from "./line"
import type { PlacedLine } from "./line/placed"

export { connectableShape, isShape, pageItemsOf, shapesOf } from "../../../core/placed"

export type DrawingPage = PagedBook["pages"][number]
export type Placed = PlacedShape
export type PageItem = PlacedItem

// ページの線
export const linesOf = (page: ItemPage): PlacedLine[] =>
  connectorsOf(page).filter((i): i is PlacedLine => i.item === LINE.id)
