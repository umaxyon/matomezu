// 図面のページに置いたアイテムの読み方: 置いたデータの外枠と、形が変わったあとの整え・関係の決まりは土台（core/placed.ts）。
// ここは、図面のページの型と、線の読み出し・組ごとの間隔・整えを、図面の置き方の層から呼ぶ入口にする
import type { PagedBook } from "../../../core/book"
import { settingsAt } from "../../../core/book-settings"
import type { ShapeItemDef } from "../../../core/def/item"
import {
  gapOf as connectorGaps,
  connectorsOf,
  type ItemPage,
  type PlacedItem,
  type PlacedShape,
  tidyPage as tidyItems,
} from "../../../core/placed"
import type { Registry } from "../../../core/registry"
import type { Book } from "../../../core/schema/book"
import { evenGap, type Gap } from "./items/push"
import { LINE } from "./line"
import type { PlacedLine } from "./line/placed"

export { connectableShape, isShape, pageItemsOf, shapesOf } from "../../../core/placed"

export type DrawingPage = PagedBook["pages"][number]
export type Placed = PlacedShape
export type PageItem = PlacedItem

// 置いた形の定義（表に無い形は null）
export function shapeDefOf(reg: Registry, item: string): ShapeItemDef | null {
  const def = reg.items.get(item)
  return def?.kind === "shape" ? def : null
}

// ページの線
export const linesOf = (page: ItemPage): PlacedLine[] =>
  connectorsOf(page).filter((i): i is PlacedLine => i.item === LINE.id)

// ページの、2 つの形の組の間隔の下限（線でつながった組は広い）
export const gapOf = (reg: Registry, page: ItemPage): Gap => connectorGaps(reg, page, evenGap)

// 形が変わったあとのページ: 端の形が無くなった線を消し、引けなくなった手で直した区間を消す
export const tidyPage = <P extends ItemPage>(reg: Registry, book: Book, page: P): P =>
  tidyItems(reg, page, settingsAt(reg, book, page))
