// 紙のページに置いたアイテムのドラッグ（データを書き換えず、新しい値を返す）。置く・押す・消すなどはbase（place/items.ts）
import { type CoreCatalog, type ItemPage, type PagedBook, type Point, type Rect, rectsOf } from "../../../plugin-api"
import { gapOf, paperSize, placedAt, withPage } from "../../base"
import { type Came, dragRects, dropManyRects, dropRects, track } from "./drag"

type Drawing = PagedBook

// 置こうとしているアイテムの左上を、ポインタから左上へこれだけ離す（画面の px）
export const PLACE_OFFSET: Point = { x: 16, y: 12 }

// ドラッグ中のアイテム id の通り道を覚え直す（drag.ts の track）
export function trackDrag(catalog: CoreCatalog, page: ItemPage, id: string, prev: Point, by: Point, came: Came): Came {
  return track(rectsOf(catalog, page), id, prev, by, came)
}

// ドラッグ中の、全部のアイテムの四角（drag.ts の dragRects。動かすアイテムと、その場で入れ替えた相手だけが動く）。描けない紙なら null
export function dragging(
  catalog: CoreCatalog,
  page: ItemPage,
  id: string,
  by: Point,
  came: Came,
): Map<string, Rect> | null {
  const paper = paperSize(catalog, page)
  return paper && dragRects(rectsOf(catalog, page), id, by, came, paper, gapOf(catalog, page))
}

// ページのアイテム ids を by だけ動かす（drag.ts。1 つなら入れ替え・向こう側へ寄せる・手前へ戻す、何個かならまとめて手前へ戻す）。
// came はドラッグの通り道で覚えた、相手ごとの先端が来た向き（無ければ始めの位置から見た向き）。無いページ・無いアイテム・収まらないなら null
export function moveItems(
  catalog: CoreCatalog,
  book: Drawing,
  pageId: string,
  ids: readonly string[],
  by: Point,
  came?: Came,
): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(catalog, page)
  if (!page || !paper) return null
  const before = rectsOf(catalog, page)
  if (!ids.every(id => before.has(id))) return null
  const gap = gapOf(catalog, page)
  const after =
    ids.length === 1
      ? dropRects(before, ids[0] as string, by, came, paper, gap)
      : dropManyRects(before, new Set(ids), by, paper, gap)
  return after && withPage(catalog, book, { ...page, items: placedAt(catalog, page, after) })
}
