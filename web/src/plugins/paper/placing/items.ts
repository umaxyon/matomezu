// 紙のページに置いたアイテムのドラッグ（データを書き換えず、新しい値を返す）。置く・押す・消すなどはbase（place/items.ts）。
// ページの形は紙の中で、子の形は親の子の領域の中で動かす（base の place/frame.ts の Frame。決まりは同じ）
import {
  type Book,
  type CoreCatalog,
  findPage,
  findShape,
  type ItemPage,
  type PlacedShape,
  type Point,
  putPage,
  type Rect,
  replaceShape,
  type ShapeOnPage,
  type Size,
  shapeSchema,
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
  placeChild,
  placedAt,
  placedSize,
  placeItem,
  shapeDefOf,
  toData,
  withPage,
} from "../../base"
import { type Came, clampBy, dragRects, dropManyRects, dropRects, track } from "./drag"

// 置こうとしているアイテムの左上を、ポインタから左上へこれだけ離す（画面の px）
export const PLACE_OFFSET: Point = { x: 16, y: 12 }

// 位置の引き算に出る浮動小数点の誤差（99.99999999999999 など）を落とした量（線の手直しの点に足すので、整数の点が整数のままになる）
const noiseless = (v: number): number => Math.round(v * 1e6) / 1e6

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

// ページのアイテム ids を一緒に動かせるか: どれも形で、同じ Frame の形（ページの形どうしか、同じ親の子どうし）
export function movableTogether(catalog: CoreCatalog, page: ItemPage, ids: readonly string[]): boolean {
  const frame = ids[0] !== undefined ? frameAround(catalog, page, ids[0]) : null
  return frame !== null && ids.every(id => frame.rects.has(id))
}

// ページのアイテム ids（どれも同じ Frame の形）を by だけ動かす（drag.ts。1 つなら入れ替え・向こう側へ寄せる・手前へ戻す、何個かならまとめて手前へ戻す）。
// came はドラッグの通り道で覚えた、相手ごとの先端が来た向き（無ければ始めの位置から見た向き）。無いページ・無いアイテム・収まらないなら null
export function moveItems(
  catalog: CoreCatalog,
  book: Book,
  pageId: string,
  ids: readonly string[],
  by: Point,
  came?: Came,
): Book | null {
  const page = findPage(book, pageId)?.page
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
  // 両端の形が同じだけ動いたつなぐもの（線の手直しなど）も一緒にずらす（大きさの変わった形は、動いたとは見ない）
  const moved = new Map<string, Point>()
  for (const [id, r] of after) {
    const was = frame.rects.get(id)
    if (was && was.w === r.w && was.h === r.h && (was.x !== r.x || was.y !== r.y))
      moved.set(id, { x: noiseless(r.x - was.x), y: noiseless(r.y - was.y) })
  }
  const followed = followConnectors(catalog, page, moved)
  if (frame.parent === null) return withPage(catalog, book, { ...followed, items: placedAt(catalog, followed, after) })
  return commitChildren(catalog, putPage(book, followed), pageId, { ...frame, parent: frame.parent }, after)
}

// moveItems が収まらないとき（null）、画面のドラッグを離したときの動かす量: by を紙の端まで切り詰め（clampBy）、それでも収まらなければ、
// 始めの位置へ 1px ずつ（大きい方の軸で数えた歩数。400 まで）戻して、最初に収まる量（stepToward）。決まった手順なので同じ入力なら同じ結果。収まる量が無ければ null
export function nearestMove(
  catalog: CoreCatalog,
  book: Book,
  pageId: string,
  ids: readonly string[],
  by: Point,
  came?: Came,
): Point | null {
  const page = findPage(book, pageId)?.page
  const frame = page && ids[0] !== undefined ? frameAround(catalog, page, ids[0]) : null
  if (!frame) return null
  const to = clampBy(frame.rects, ids, by, frame.paper)
  return stepToward(to, { x: 0, y: 0 }, p => moveItems(catalog, book, pageId, ids, p, came) !== null)
}

// 付け替えで形 item を、紙の上の where へ移して形 parent の中へ入れた（null はページへ出した）ブック。入れられなければ null
// （action の item-reparent と同じ決まり。抜いて、親の子の領域の左上より左や上なら寄せて入れる）
export function reparentedAt(
  catalog: CoreCatalog,
  book: Book,
  pageId: string,
  item: string,
  parent: string | null,
  where: Point,
): Book | null {
  const page = findPage(book, pageId)?.page
  const found = page && findShape(page, item)
  const out = page && replaceShape(page, item, () => null)
  if (!page || !found || !out || found.parent === parent) return null
  const without = putPage(book, out)
  const into = parent === null ? null : findShape(out, parent)
  if (parent !== null && !into) return null
  if (!into) return placeItem(catalog, without, pageId, { ...found.shape, ...where })
  return placeChild(catalog, without, pageId, into.shape.id, found.shape, {
    x: where.x - into.at.x,
    y: where.y - into.at.y,
  })
}

// 付け替えの道具を離したとき、入れる所 at（紙の上）に入れられなければ、入れる先の子の領域の左上（ページなら今の位置）へ 1px ずつ寄せて、
// 最初に入れられる at。無ければ null
export function nearestReparent(
  catalog: CoreCatalog,
  book: Book,
  pageId: string,
  item: string,
  parent: string | null,
  at: Point,
): Point | null {
  const page = findPage(book, pageId)?.page
  const found = page && findShape(page, item)
  const into = page && parent !== null ? findShape(page, parent) : null
  if (!page || !found) return null
  const target = into
    ? { x: into.at.x + childOrigin(catalog, into.shape).x, y: into.at.y + childOrigin(catalog, into.shape).y }
    : found.at
  return stepToward(at, target, p => reparentedAt(catalog, book, pageId, item, parent, p) !== null)
}

// 点 from から to へ向けて 1px ずつ（大きい方の軸で数えた歩数。400 まで）寄せて、最初に fits を通す点（from から試す）
export function stepToward(from: Point, to: Point, fits: (p: Point) => boolean): Point | null {
  const steps = Math.min(400, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))))
  for (let i = 0; i <= steps; i++) {
    const k = steps === 0 ? 0 : i / steps
    const p = { x: Math.round(from.x + (to.x - from.x) * k), y: Math.round(from.y + (to.y - from.y) * k) }
    if (fits(p)) return p
  }
  return null
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
  page: ItemPage,
  parent: string | null,
  size: Size,
  fits: (at: Point) => boolean = () => true,
): Point | null {
  const frame = frameOf(catalog, page, parent)
  if (!frame) return null
  const at = (spot: Point) => ({ x: spot.x + frame.origin.x, y: spot.y + frame.origin.y })
  const spot = freeSpotIn(frame, size, s => fits(at(s)))
  return spot && at(spot)
}

// 置いた形のデータとして確かめる（形の定義の項目と中身の形。表に無い形は通らない）
export function parsePlaced(
  catalog: CoreCatalog,
  value: { item: string; [field: string]: unknown },
): PlacedShape | null {
  const def = shapeDefOf(catalog, value.item)
  const parsed = def && shapeSchema(def).safeParse(value)
  return parsed?.success ? (parsed.data as PlacedShape) : null
}

// 置こうとしている物 item を、項目を既定（渡す値 given があればその値）にして置いた形（置けるかを試すための形。ページには書かないので、id は置いた物と重なってもよい）。置けない物なら null
export function placingShape(catalog: CoreCatalog, item: string, given: object = {}): PlacedShape | null {
  const props = catalog.items.get(item)?.props.safeParse(given)
  return props?.success ? parsePlaced(catalog, { id: "placing", item, x: 0, y: 0, props: props.data }) : null
}

// 置く道具の置き先: 入れる親 parent（null はページ）と、左上 at（item-place と同じく、親があれば親の左上から）。
// free なら空きに置く（at は、置く物の定義の大きさで探した空き。置くときは at を渡さず、中身を決めた大きさで item-place が探し直す）。
// shown は、置く所の紙の上の左上（点線の影を描く所）。fits は、そこに置けるか（ページに置くなら紙からはみ出さないか。親の中と空きは置ける）
export interface PlaceTarget {
  parent: string | null
  at: Point
  free: boolean
  shown: Point
  fits: boolean
}

// 置く道具で、ポインタの点 pointer（紙の上）の所に、左上 at（紙の上）で形 shape（placingShape）を置くときの置き先。
// 点の下の一番内側の形が子を持てる形なら、その中の at（子の領域より左や上なら、item-place と同じく子の領域の左上へ寄せた所に影を描く）。
// 子を持てない形（リスト・シェイプなど）なら、その形の親（ページか形）の中の空き（freeAt）。点の下に形が無ければ、ページの at。空きが無ければ null。
// 置けるか（fits）は、画面と同じに押して置いてみて決める（親が育って紙からはみ出すなら置けない）
export function placeTarget(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  pointer: Point,
  at: Point,
  shape: PlacedShape,
): PlaceTarget | null {
  const size = placedSize(catalog, shape)
  if (!size) return null
  const under = innermostAt(catalog, page, pointer)
  if (!under) {
    const fits = placeItem(catalog, book, page.id, { ...shape, ...at }) !== null
    return { parent: null, at, free: false, shown: at, fits }
  }
  if (nests(catalog, under.shape.item)) {
    const inner = { x: at.x - under.at.x, y: at.y - under.at.y }
    const origin = childOrigin(catalog, under.shape)
    const shown = { x: under.at.x + Math.max(inner.x, origin.x), y: under.at.y + Math.max(inner.y, origin.y) }
    const fits = placeChild(catalog, book, page.id, under.shape.id, shape, inner) !== null
    return { parent: under.shape.id, at: inner, free: false, shown, fits }
  }
  const spot = freeAt(catalog, page, under.parent, size)
  const base = under.parent === null ? { x: 0, y: 0 } : walkShapes(page).find(s => s.shape.id === under.parent)?.at
  if (!spot || !base) return null
  return { parent: under.parent, at: spot, free: true, shown: { x: base.x + spot.x, y: base.y + spot.y }, fits: true }
}
