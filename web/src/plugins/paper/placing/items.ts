// 紙のページに置いたアイテムのドラッグ（データを書き換えず、新しい値を返す）。置く・押す・消すなどはbase（place/items.ts）。
// ページの形は紙の中で、子の形は親の子の領域の中で動かす（base の place/frame.ts の Frame。決まりは同じ）
import { type CoreCatalog, type ItemPage, type PagedBook, type Point, type Rect, walkShapes } from "../../../plugin-api"
import { commitChildren, frameAround, gapOf, placedAt, placedSize, toData, withPage } from "../../base"
import { type Came, dragRects, dropManyRects, dropRects, track } from "./drag"

// 置こうとしているアイテムの左上を、ポインタから左上へこれだけ離す（画面の px）
export const PLACE_OFFSET: Point = { x: 16, y: 12 }

// ドラッグ中のアイテム id の通り道を覚え直す（drag.ts の track）
export function trackDrag(catalog: CoreCatalog, page: ItemPage, id: string, prev: Point, by: Point, came: Came): Came {
  const frame = frameAround(catalog, page, id)
  return frame ? track(frame.rects, id, prev, by, came) : came
}

// ドラッグ中の、同じ Frame のアイテムの四角（drag.ts の dragRects。動かすアイテムと、その場で入れ替えた相手だけが動く）。
// 四角はデータの位置（子の形は親の左上から）。無い形・描けない紙なら null
export function dragging(
  catalog: CoreCatalog,
  page: ItemPage,
  id: string,
  by: Point,
  came: Came,
): Map<string, Rect> | null {
  const frame = frameAround(catalog, page, id)
  return frame && toData(frame, dragRects(frame.rects, id, by, came, frame.paper, gapOf(catalog, page)))
}

// ページのアイテム ids（どれも同じ Frame の形）を by だけ動かす（drag.ts。1 つなら入れ替え・向こう側へ寄せる・手前へ戻す、何個かならまとめて手前へ戻す）。
// came はドラッグの通り道で覚えた、相手ごとの先端が来た向き（無ければ始めの位置から見た向き）。無いページ・無いアイテム・収まらないなら null
export function moveItems(
  catalog: CoreCatalog,
  book: PagedBook,
  pageId: string,
  ids: readonly string[],
  by: Point,
  came?: Came,
): PagedBook | null {
  const page = book.pages.find(p => p.id === pageId)
  const frame = page && ids[0] !== undefined ? frameAround(catalog, page, ids[0]) : null
  if (!page || !frame) return null
  // どれも同じ Frame の形（ページの形と子の形、親の違う子は一緒に動かさない）
  if (!ids.every(id => frame.rects.has(id))) return null
  const gap = gapOf(catalog, page)
  const after =
    ids.length === 1
      ? dropRects(frame.rects, ids[0] as string, by, came, frame.paper, gap)
      : dropManyRects(frame.rects, new Set(ids), by, frame.paper, gap)
  if (!after) return null
  return frame.parent === null
    ? withPage(catalog, book, { ...page, items: placedAt(catalog, page, after) })
    : commitChildren(catalog, book, pageId, { ...frame, parent: frame.parent }, after)
}

// 付け替えの道具で形 id を落とす先: 紙の上の点 at の下で一番内側の、子を持てる形の id（id と、その子孫は除く）。無ければ null（ページ）
export function dropTarget(catalog: CoreCatalog, page: ItemPage, id: string, at: Point): string | null {
  const shapes = walkShapes(page)
  const own = new Set([id])
  for (const s of shapes) if (s.parent !== null && own.has(s.parent)) own.add(s.shape.id)
  let target: string | null = null
  for (const { shape, at: p } of shapes) {
    if (own.has(shape.id) || !catalog.items.get(shape.item)?.capabilities.includes("nests")) continue
    const size = placedSize(catalog, shape)
    if (size && at.x >= p.x && at.y >= p.y && at.x < p.x + size.w && at.y < p.y + size.h) target = shape.id
  }
  return target
}
