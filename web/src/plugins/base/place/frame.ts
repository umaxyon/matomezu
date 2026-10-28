// Frame（形を並べる所）: ページの形は紙の中に、子の形は親の子の領域の中に並べる（紙に収める決まりを、親の中にも同じにかける）。
// Frame の中の四角は Frame の左上から。子の領域は右と下へ限りが無く（親が子に合わせて育つ）、縮めはしない
import type { PagedBook } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ShapeData } from "../../../core/def/item"
import type { Point, Rect, Size } from "../../../core/geom"
import { findShape, type ItemPage, type PlacedShape } from "../../../core/placed"
import { gapOf, paperSize, replaceShapePushing } from "./items"
import { NEST_PADDING, placedSize, rectsOf } from "./placed"
import { inPaper, newClash, planPlace, pushFrom } from "./push"

// 子の領域の大きさ（右と下へ限りが無い）
export const CHILD_AREA: Size = { w: Number.POSITIVE_INFINITY, h: Number.POSITIVE_INFINITY }

export interface Frame {
  parent: string | null // 子の領域の持ち主の形の id（ページなら null）
  origin: Point // Frame の左上（データの位置 = Frame の中の位置 + origin。ページは紙の左上）
  paper: Size // Frame の大きさ
  rects: Map<string, Rect> // Frame の中の形の四角（Frame の左上から。大きさの分からない形は入れない）
}

// 子の形を持つ形の、子の領域の左上（形の左上から）
export function childOrigin(catalog: CoreCatalog, shape: PlacedShape): Point {
  const def = catalog.items.get(shape.item)
  return (def?.kind === "shape" && def.childOrigin?.(shape as ShapeData)) || { x: NEST_PADDING, y: NEST_PADDING }
}

// 親の子の四角（子の領域の左上から）
function childRects(catalog: CoreCatalog, parent: PlacedShape, origin: Point): Map<string, Rect> {
  const rects = new Map<string, Rect>()
  for (const c of (parent.shapes ?? []) as PlacedShape[]) {
    const size = placedSize(catalog, c)
    if (size) rects.set(c.id, { x: c.x - origin.x, y: c.y - origin.y, ...size })
  }
  return rects
}

// 形 parent の子の領域の Frame（null ならページの紙）。無い形・描けない紙なら null
export function frameOf(catalog: CoreCatalog, page: ItemPage, parent: string | null): Frame | null {
  if (parent === null) {
    const paper = paperSize(catalog, page)
    return paper && { parent, origin: { x: 0, y: 0 }, paper, rects: rectsOf(catalog, page) }
  }
  const shape = findShape(page, parent)?.shape
  if (!shape) return null
  const origin = childOrigin(catalog, shape)
  return { parent, origin, paper: CHILD_AREA, rects: childRects(catalog, shape, origin) }
}

// 形 id が並ぶ Frame（ページの形なら紙、子の形なら親の子の領域）。無い形なら null
export function frameAround(catalog: CoreCatalog, page: ItemPage, id: string): Frame | null {
  const found = findShape(page, id)
  return found ? frameOf(catalog, page, found.parent) : null
}

// Frame の中の四角を、データの位置にしたもの（Frame の左上を足す）
export const toData = (frame: Frame, rects: ReadonlyMap<string, Rect>): Map<string, Rect> =>
  new Map([...rects].map(([id, r]) => [id, { ...r, x: r.x + frame.origin.x, y: r.y + frame.origin.y }]))

// 子の領域の Frame の四角 after を、親の子の位置にしたブック。put の形は、同じ id の子と置き換えるか、末尾に足す（位置は after から）。
// 親は子に合わせて育ち、一番上の祖先でページの形を押す（replaceShapePushing）。無いページ・無い親・紙に収まらないなら null
export function commitChildren<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  frame: Frame & { parent: string },
  after: ReadonlyMap<string, Rect>,
  put: readonly PlacedShape[] = [],
): B | null {
  const at = (s: PlacedShape): PlacedShape => {
    const r = after.get(s.id)
    return r ? { ...s, x: r.x + frame.origin.x, y: r.y + frame.origin.y } : s
  }
  return replaceShapePushing(catalog, book, pageId, frame.parent, parent => {
    const now = (parent.shapes ?? []) as PlacedShape[]
    const kept = now.map(c => at(put.find(p => p.id === c.id) ?? c))
    const added = put.filter(p => !now.some(c => c.id === p.id)).map(at)
    return { ...parent, shapes: [...kept, ...added] } as PlacedShape
  })
}

// 子が子の領域の左上より左や上にある形を、子の並びを崩さずに右や下へずらした形（本文が伸びて子の領域が下がったときなど）。ずらさなくてよければそのまま
export function settleChildren(catalog: CoreCatalog, shape: PlacedShape): PlacedShape {
  if (!shape.shapes?.length) return shape
  const origin = childOrigin(catalog, shape)
  const children = shape.shapes as PlacedShape[]
  const dx = Math.max(0, origin.x - Math.min(...children.map(c => c.x)))
  const dy = Math.max(0, origin.y - Math.min(...children.map(c => c.y)))
  if (dx === 0 && dy === 0) return shape
  return { ...shape, shapes: children.map(c => ({ ...c, x: c.x + dx, y: c.y + dy })) } as PlacedShape
}

// 形 shape を、形 parent の子の領域に置いたブック（at は親の左上から。子の領域より左や上なら、子の領域の左上へ寄せる）。
// 重なった子は右へ、駄目なら下へ押す（紙に置くときと同じ。縮めない）。無いページ・無い親・紙に収まらないなら null
export function placeChild<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  parent: string,
  shape: PlacedShape,
  at: Point,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const frame = page && frameOf(catalog, page, parent)
  const size = placedSize(catalog, shape)
  if (!page || !frame || !size) return null
  const rect = { x: Math.max(0, at.x - frame.origin.x), y: Math.max(0, at.y - frame.origin.y), ...size }
  const after = planPlace(frame.rects, shape.id, rect, frame.paper, undefined, gapOf(catalog, page))
  return after && commitChildren(catalog, book, pageId, { ...frame, parent }, after, [shape])
}

// 子の形を next に置き換え、近づきすぎた兄弟を親の中で押してどけたブック（縮めない）。子の領域より左や上・押せない・紙に収まらないなら null
export function replaceChild<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  next: PlacedShape,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const frame = page && frameAround(catalog, page, next.id)
  const size = placedSize(catalog, next)
  if (!page || !frame || frame.parent === null || !size) return null
  const rect = { x: next.x - frame.origin.x, y: next.y - frame.origin.y, ...size }
  if (!inPaper(rect, frame.paper)) return null
  const gap = gapOf(catalog, page)
  const after = pushFrom(frame.rects, next.id, rect, frame.paper, undefined, gap)
  if (!after || newClash(frame.rects, after, gap)) return null
  return commitChildren(catalog, book, pageId, { ...frame, parent: frame.parent }, after, [next])
}
