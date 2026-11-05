// 紙のページに置いたアイテムのドラッグ（データを書き換えず、新しい値を返す）。置く・押す・消すなどはbase（place/items.ts）。
// ページの形は紙の中で、子の形は親の子の領域の中で動かす（base の place/frame.ts の Frame。決まりは同じ）
import {
  type Book,
  type CoreCatalog,
  type ItemPage,
  type PagedBook,
  type Point,
  putPage,
  type Rect,
  type ShapeOnPage,
  type Size,
  walkShapes,
} from "../../../plugin-api"
import {
  childOrigin,
  commitChildren,
  followConnectors,
  frameAround,
  frameOf,
  freeSpotIn,
  gapOf,
  placedAt,
  placedSize,
  toData,
  withPage,
} from "../../base"
import { type Came, dragRects, dropManyRects, dropRects, track } from "./drag"

// 置こうとしているアイテムの左上を、ポインタから左上へこれだけ離す（画面の px）
export const PLACE_OFFSET: Point = { x: 16, y: 12 }

// ドラッグ中のアイテム id の通り道を覚え直す（drag.ts の track）
export function trackDrag(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  id: string,
  prev: Point,
  by: Point,
  came: Came,
): Came {
  const frame = frameAround(catalog, book, page, id)
  return frame ? track(frame.rects, id, prev, by, came) : came
}

// ドラッグ中の、同じ Frame のアイテムの四角（drag.ts の dragRects。動かすアイテムと、その場で入れ替えた相手だけが動く）。
// 四角はデータの位置（子の形は親の左上から）。無い形・描けない紙なら null
export function dragging(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  id: string,
  by: Point,
  came: Came,
): Map<string, Rect> | null {
  const frame = frameAround(catalog, book, page, id)
  return frame && toData(frame, dragRects(frame.rects, id, by, came, frame.paper, gapOf(catalog, page)))
}

// ページのアイテム ids を一緒に動かせるか: どれも形で、同じ Frame の形（ページの形どうしか、同じ親の子どうし）
export function movableTogether(catalog: CoreCatalog, book: Book, page: ItemPage, ids: readonly string[]): boolean {
  const frame = ids[0] !== undefined ? frameAround(catalog, book, page, ids[0]) : null
  return frame !== null && ids.every(id => frame.rects.has(id))
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
  const frame = page && ids[0] !== undefined ? frameAround(catalog, book, page, ids[0]) : null
  if (!page || !frame) return null
  // どれも同じ Frame の形（ページの形と子の形、親の違う子は一緒に動かさない）
  if (!ids.every(id => frame.rects.has(id))) return null
  const gap = gapOf(catalog, page)
  const after =
    ids.length === 1
      ? dropRects(frame.rects, ids[0] as string, by, came, frame.paper, gap)
      : dropManyRects(frame.rects, new Set(ids), by, frame.paper, gap)
  if (!after) return null
  // 両端の形が同じだけ動いたつなぐもの（線の手直しなど）も一緒にずらす（大きさの変わった形は、動いたとは見ない）
  const moved = new Map<string, Point>()
  for (const [id, r] of after) {
    const was = frame.rects.get(id)
    if (was && was.w === r.w && was.h === r.h && (was.x !== r.x || was.y !== r.y))
      moved.set(id, { x: r.x - was.x, y: r.y - was.y })
  }
  const followed = followConnectors(catalog, page, moved)
  if (frame.parent === null) return withPage(catalog, book, { ...followed, items: placedAt(catalog, followed, after) })
  return commitChildren(catalog, putPage(book, followed), pageId, { ...frame, parent: frame.parent }, after)
}

// 形 id と、その子孫の id
export function subtreeOf(page: ItemPage, id: string): Set<string> {
  const own = new Set([id])
  for (const { shape, parent } of walkShapes(page)) if (parent !== null && own.has(parent)) own.add(shape.id)
  return own
}

// 紙の上の点 at の下で一番内側の形のうち、accept が通す物（子の形も）。無ければ null
function innermostAt(
  catalog: CoreCatalog,
  page: ItemPage,
  at: Point,
  accept: (shape: ShapeOnPage) => boolean = () => true,
): ShapeOnPage | null {
  let found: ShapeOnPage | null = null
  for (const s of walkShapes(page)) {
    const size = accept(s) ? placedSize(catalog, s.shape) : null
    if (size && at.x >= s.at.x && at.y >= s.at.y && at.x < s.at.x + size.w && at.y < s.at.y + size.h) found = s
  }
  return found
}

const nests = (catalog: CoreCatalog, item: string) => catalog.items.get(item)?.capabilities.includes("nests") === true

// 付け替えの道具で形 id を落とす先: 紙の上の点 at の下で一番内側の、子を持てる形の id（id と、その子孫は除く）。無ければ null（ページ）
export function dropTarget(catalog: CoreCatalog, page: ItemPage, id: string, at: Point): string | null {
  const own = subtreeOf(page, id)
  return innermostAt(catalog, page, at, s => !own.has(s.shape.id) && nests(catalog, s.shape.item))?.shape.id ?? null
}

// 大きさ size の形を、形 parent（null はページ）の中に置ける空きの左上（item-place の at と同じく、親があれば親の左上から）。
// 空きは base の freeSpotIn の格子で、fits が通す目（Frame の左上からでなく、この at で受ける）。無ければ null
export function freeAt(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  parent: string | null,
  size: Size,
  fits: (at: Point) => boolean = () => true,
): Point | null {
  const frame = frameOf(catalog, book, page, parent)
  if (!frame) return null
  const at = (spot: Point) => ({ x: spot.x + frame.origin.x, y: spot.y + frame.origin.y })
  const spot = freeSpotIn(frame, size, s => fits(at(s)))
  return spot && at(spot)
}

// 置く道具の置き先: 入れる親 parent（null はページ）と、左上 at（item-place と同じく、親があれば親の左上から）。
// free なら空きに置く（at は、置く物の定義の大きさで探した空き。置くときは at を渡さず、中身を決めた大きさで item-place が探し直す）。
// shown は、置く所の紙の上の左上（点線の影を描く所）
export interface PlaceTarget {
  parent: string | null
  at: Point
  free: boolean
  shown: Point
}

// 置く道具で、ポインタの点 pointer（紙の上）の所に、左上 at（紙の上）・大きさ size の形を置くときの置き先。
// 点の下の一番内側の形が子を持てる形なら、その中の at（子の領域より左や上なら、item-place と同じく子の領域の左上へ寄せた所に影を描く）。
// 子を持てない形（リスト・シェイプなど）なら、その形の親（ページか形）の中の空き（freeAt）。点の下に形が無ければ、ページの at。空きが無ければ null
export function placeTarget(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  pointer: Point,
  at: Point,
  size: Size,
): PlaceTarget | null {
  const under = innermostAt(catalog, page, pointer)
  if (!under) return { parent: null, at, free: false, shown: at }
  if (nests(catalog, under.shape.item)) {
    const inner = { x: at.x - under.at.x, y: at.y - under.at.y }
    const origin = childOrigin(catalog, under.shape)
    const shown = { x: under.at.x + Math.max(inner.x, origin.x), y: under.at.y + Math.max(inner.y, origin.y) }
    return { parent: under.shape.id, at: inner, free: false, shown }
  }
  const spot = freeAt(catalog, book, page, under.parent, size)
  const base = under.parent === null ? { x: 0, y: 0 } : walkShapes(page).find(s => s.shape.id === under.parent)?.at
  if (!spot || !base) return null
  return { parent: under.parent, at: spot, free: true, shown: { x: base.x + spot.x, y: base.y + spot.y } }
}
