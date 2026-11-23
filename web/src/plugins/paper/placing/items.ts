// 紙のページに置いたアイテムのドラッグ（データを書き換えず、新しい値を返す）。置く・押す・消すなどはbase（place/items.ts）。
// ページの形は紙の中で、子の形は親の子の領域の中で動かす（base の place/frame.ts の Frame。決まりは同じ）
import {
  type CoreCatalog,
  findShape,
  type ItemPage,
  NO_ITEM,
  NO_PROPS,
  PAGE_ITSELF,
  type PlacedShape,
  type Point,
  type Rect,
  replaceShape,
  type ShapeOnPage,
  type ShapeParent,
  type Size,
  shapeSchema,
  walkShapes,
} from "../../../plugin-api"
import {
  CANNOT_PLACE,
  type CANNOT_RESIZE,
  childOrigin,
  commitChildren,
  type Edges,
  followConnectors,
  frameAround,
  frameOf,
  freeSpotIn,
  gapOf,
  NO_FRAME,
  NO_SHAPE_DEF,
  NO_SIZE,
  NO_SPOT,
  placeChild,
  placedAt,
  placedSize,
  placeItem,
  resizedBy,
  shapeDefOf,
  tidyPage,
  toData,
} from "../../base"
import { kit } from "../kit"
import { type Came, clampBy, dragRects, dropManyRects, dropRects, track } from "./drag"

// 置こうとしているアイテムの左上を、ポインタから左上へこれだけ離す（画面の px）
export const PLACE_OFFSET: Point = { x: 16, y: 12 }

// 位置の引き算に出る浮動小数点の誤差（99.99999999999999 など）を落とした量（線の手直しの点に足すので、整数の点が整数のままになる）
const noiseless = (v: number): number => Math.round(v * 1e6) / 1e6

// アイテム item の辺 edges を、紙の上で by だけ動かした位置と大きさ（比を保つ形は比を保つ。変えられなければ CANNOT_RESIZE。base の resizedBy）
export function stretchedBy(
  catalog: CoreCatalog,
  item: PlacedShape,
  edges: Edges,
  by: Point,
  paper: Size,
): { x: number; y: number; w: number; h: number } | typeof CANNOT_RESIZE {
  const def = shapeDefOf(catalog, item.item)
  const ratio = def !== NO_SHAPE_DEF && def[kit.name("stretch")] === "ratio"
  return resizedBy(catalog, item, edges, by, paper, ratio)
}

// アイテム item を大きさ size にした物（大きさを項目に写す形〈定義の resizedTo〉は写した項目にし、w・h を書かない）
export function sizedTo(catalog: CoreCatalog, item: PlacedShape, size: Size): PlacedShape {
  const def = shapeDefOf(catalog, item.item)
  const write = def !== NO_SHAPE_DEF ? def.resizedTo : undefined
  return write ? (write(item as never, size) as PlacedShape) : { ...item, w: size.w, h: size.h }
}

// ドラッグ中のアイテム id の通り道を覚え直す（drag.ts の track）
export function trackDrag(catalog: CoreCatalog, page: ItemPage, id: string, prev: Point, by: Point, came: Came): Came {
  const frame = frameAround(catalog, page, id)
  return frame !== NO_FRAME ? track(frame.rects, id, prev, by, came) : came
}

// ドラッグ中の、同じ Frame のアイテムの四角（drag.ts の dragRects。動かすアイテムと、その場で入れ替えた相手だけが動く）。
// 四角はデータの位置（子の形は親の左上から）。無い形なら null
export function dragging(
  catalog: CoreCatalog,
  page: ItemPage,
  id: string,
  by: Point,
  came: Came,
): Map<string, Rect> | null {
  const frame = frameAround(catalog, page, id)
  if (frame === NO_FRAME) return null
  return toData(frame, dragRects(frame.rects, id, by, came, frame.paper, gapOf(catalog, page)))
}

// ページのアイテム ids を一緒に動かせるか: どれも形で、同じ Frame の形（ページの形どうしか、同じ親の子どうし）
export function movableTogether(catalog: CoreCatalog, page: ItemPage, ids: readonly string[]): boolean {
  const frame = ids[0] !== undefined ? frameAround(catalog, page, ids[0]) : NO_FRAME
  return frame !== NO_FRAME && ids.every(id => frame.rects.has(id))
}

// ページのアイテム ids（どれも同じ Frame の形）を by だけ動かす（drag.ts。1 つなら入れ替え・向こう側へ寄せる・手前へ戻す、何個かならまとめて手前へ戻す）。
// came はドラッグの通り道で覚えた、相手ごとの先端が来た向き（無ければ始めの位置から見た向き）。無いアイテム・収まらないなら CANNOT_PLACE
export function moveItems(
  catalog: CoreCatalog,
  page: ItemPage,
  ids: readonly string[],
  by: Point,
  came?: Came,
): ItemPage | typeof CANNOT_PLACE {
  const frame = ids[0] !== undefined ? frameAround(catalog, page, ids[0]) : NO_FRAME
  if (frame === NO_FRAME) return CANNOT_PLACE
  // どれも同じ Frame の形（ページの形と子の形、親の違う子は一緒に動かさない）
  if (!ids.every(id => frame.rects.has(id))) return CANNOT_PLACE
  const gap = gapOf(catalog, page)
  const after =
    ids.length === 1
      ? dropRects(frame.rects, ids[0] as string, by, came, frame.paper, gap)
      : dropManyRects(frame.rects, new Set(ids), by, frame.paper, gap)
  if (!after) return CANNOT_PLACE
  // 両端の形が同じだけ動いたつなぐもの（線の手直しなど）も一緒にずらす（大きさの変わった形は、動いたとは見ない）
  const moved = new Map<string, Point>()
  for (const [id, r] of after) {
    const was = frame.rects.get(id)
    if (was && was.w === r.w && was.h === r.h && (was.x !== r.x || was.y !== r.y))
      moved.set(id, { x: noiseless(r.x - was.x), y: noiseless(r.y - was.y) })
  }
  const followed = followConnectors(catalog, page, moved)
  if (frame.parent === PAGE_ITSELF) return tidyPage(catalog, { ...followed, items: placedAt(catalog, followed, after) })
  return commitChildren(catalog, followed, { ...frame, parent: frame.parent }, after)
}

// moveItems が収まらないとき（CANNOT_PLACE）、画面のドラッグを離したときの動かす量: by を紙の端まで切り詰め（clampBy）、それでも収まらなければ、
// 始めの位置へ 1px ずつ（大きい方の軸で数えた歩数。400 まで）戻して、最初に収まる量（stepToward）。決まった手順なので同じ入力なら同じ結果。収まる量が無ければ null
export function nearestMove(
  catalog: CoreCatalog,
  page: ItemPage,
  ids: readonly string[],
  by: Point,
  came?: Came,
): Point | null {
  const frame = ids[0] !== undefined ? frameAround(catalog, page, ids[0]) : NO_FRAME
  if (frame === NO_FRAME) return null
  const to = clampBy(frame.rects, ids, by, frame.paper)
  return stepToward(to, { x: 0, y: 0 }, p => moveItems(catalog, page, ids, p, came) !== CANNOT_PLACE)
}

// 付け替えで形 item を、紙の上の where へ移して形 parent の中へ入れた（null はページへ出した）ページ。入れられなければ CANNOT_PLACE
// （action の item-reparent と同じ決まり。抜いて、親の子の領域の左上より左や上なら寄せて入れる）
export function reparentedAt(
  catalog: CoreCatalog,
  page: ItemPage,
  item: string,
  parent: ShapeParent,
  where: Point,
): ItemPage | typeof CANNOT_PLACE {
  const found = findShape(page, item)
  const out = replaceShape(page, item, () => NO_ITEM)
  if (found === NO_ITEM || out === NO_ITEM || found.parent === parent) return CANNOT_PLACE
  if (parent === PAGE_ITSELF) return placeItem(catalog, out, { ...found.shape, ...where })
  const into = findShape(out, parent)
  if (into === NO_ITEM) return CANNOT_PLACE
  return placeChild(catalog, out, into.shape.id, found.shape, {
    x: where.x - into.at.x,
    y: where.y - into.at.y,
  })
}

// 付け替えの道具を離したとき、入れる所 at（紙の上）に入れられなければ、入れる先の子の領域の左上（ページなら今の位置）へ 1px ずつ寄せて、
// 最初に入れられる at。無ければ null
export function nearestReparent(
  catalog: CoreCatalog,
  page: ItemPage,
  item: string,
  parent: ShapeParent,
  at: Point,
): Point | null {
  const found = findShape(page, item)
  const into = parent !== PAGE_ITSELF ? findShape(page, parent) : NO_ITEM
  if (found === NO_ITEM) return null
  const target =
    into !== NO_ITEM
      ? { x: into.at.x + childOrigin(catalog, into.shape).x, y: into.at.y + childOrigin(catalog, into.shape).y }
      : found.at
  return stepToward(at, target, p => reparentedAt(catalog, page, item, parent, p) !== CANNOT_PLACE)
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
  for (const { shape, parent } of walkShapes(page)) if (parent !== PAGE_ITSELF && own.has(parent)) own.add(shape.id)
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
    const size = accept(s) ? placedSize(catalog, s.shape) : NO_SIZE
    if (size !== NO_SIZE && at.x >= s.at.x && at.y >= s.at.y && at.x < s.at.x + size.w && at.y < s.at.y + size.h)
      found = s
  }
  return found
}

const nests = (catalog: CoreCatalog, item: string) => catalog.items.get(item)?.capabilities.includes("nests") === true

// 付け替えの道具で形 id を落とす先: 紙の上の点 at の下で一番内側の、子を持てる形の id（id と、その子孫は除く）。無ければ null（ページ）
export function dropTarget(catalog: CoreCatalog, page: ItemPage, id: string, at: Point): string | null {
  const own = subtreeOf(page, id)
  return innermostAt(catalog, page, at, s => !own.has(s.shape.id) && nests(catalog, s.shape.item))?.shape.id ?? null
}

// 大きさ size の形を、親 parent（PAGE_ITSELF はページ）の中に置ける空きの左上（item-place の at と同じく、親があれば親の左上から）。
// 空きは base の freeSpotIn の格子で、fits が通す目（Frame の左上からでなく、この at で受ける）。無ければ null
export function freeAt(
  catalog: CoreCatalog,
  page: ItemPage,
  parent: ShapeParent,
  size: Size,
  fits: (at: Point) => boolean = () => true,
): Point | null {
  const frame = frameOf(catalog, page, parent)
  if (frame === NO_FRAME) return null
  const at = (spot: Point) => ({ x: spot.x + frame.origin.x, y: spot.y + frame.origin.y })
  const spot = freeSpotIn(frame, size, s => fits(at(s)))
  return spot === NO_SPOT ? null : at(spot)
}

// 置いた形のデータとして確かめる（形の定義の項目と中身の形。表に無い形は通らない）
export function parsePlaced(
  catalog: CoreCatalog,
  value: { item: string; [field: string]: unknown },
): PlacedShape | null {
  const def = shapeDefOf(catalog, value.item)
  const parsed = def !== NO_SHAPE_DEF ? shapeSchema(def).safeParse(value) : undefined
  return parsed?.success ? (parsed.data as PlacedShape) : null
}

// 置こうとしている物 item を、項目を既定（渡す値 given が NO_PROPS でなければその値）にして置いた形（置けるかを試すための形。ページには書かないので、id は置いた物と重なってもよい）。置けない物なら null
export function placingShape(
  catalog: CoreCatalog,
  item: string,
  given: object | typeof NO_PROPS = NO_PROPS,
): PlacedShape | null {
  const props = catalog.items.get(item)?.props.safeParse(given === NO_PROPS ? {} : given)
  return props?.success ? parsePlaced(catalog, { id: "placing", item, x: 0, y: 0, props: props.data }) : null
}

// 置く道具の置き先: 入れる親 parent（null はページ）と、左上 at（item-place と同じく、親があれば親の左上から）。
// free なら空きに置く（at は、置く物の定義の大きさで探した空き。置くときは at を渡さず、中身を決めた大きさで item-place が探し直す）。
// shown は、置く所の紙の上の左上（点線の影を描く所）。fits は、そこに置けるか（ページに置くなら紙からはみ出さないか。親の中と空きは置ける）
export interface PlaceTarget {
  parent: ShapeParent
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
  page: ItemPage,
  pointer: Point,
  at: Point,
  shape: PlacedShape,
): PlaceTarget | null {
  const size = placedSize(catalog, shape)
  if (size === NO_SIZE) return null
  const under = innermostAt(catalog, page, pointer)
  if (!under) {
    const fits = placeItem(catalog, page, { ...shape, ...at }) !== CANNOT_PLACE
    return { parent: PAGE_ITSELF, at, free: false, shown: at, fits }
  }
  if (nests(catalog, under.shape.item)) {
    const inner = { x: at.x - under.at.x, y: at.y - under.at.y }
    const origin = childOrigin(catalog, under.shape)
    const shown = { x: under.at.x + Math.max(inner.x, origin.x), y: under.at.y + Math.max(inner.y, origin.y) }
    const fits = placeChild(catalog, page, under.shape.id, shape, inner) !== CANNOT_PLACE
    return { parent: under.shape.id, at: inner, free: false, shown, fits }
  }
  const spot = freeAt(catalog, page, under.parent, size)
  const base =
    under.parent === PAGE_ITSELF ? { x: 0, y: 0 } : walkShapes(page).find(s => s.shape.id === under.parent)?.at
  if (!spot || !base) return null
  return { parent: under.parent, at: spot, free: true, shown: { x: base.x + spot.x, y: base.y + spot.y }, fits: true }
}
