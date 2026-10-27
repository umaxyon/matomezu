// ページに置いたアイテムの操作（データを書き換えず、新しい値を返す）。
// アイテムは紙から少しでもはみ出す所には置かず、動かさない。置いた・動かした・大きさか左上が変わったアイテムは、近づきすぎた相手をどける（push.ts）。
// 形が変わったあとは、ページのつなぐものの決まりで整える（core/placed.ts の tidyPage）
import { type PagedBook, putPage } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ConnectorData, PageContext, ShapeItemDef } from "../../../core/def/item"
import type { Point, Size } from "../../../core/geom"
import { freshId } from "../../../core/ids"
import { resolvePaper } from "../../../core/paper"
import {
  gapOf as connectorGaps,
  connectorsOf,
  type ItemPage,
  isShape,
  type PlacedConnector,
  type PlacedItem,
  type PlacedShape,
  pageItemsOf,
  placedSize,
  portAreasOf,
  rectsOf,
  shapesOf,
  tidyPage as tidyItems,
} from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"
import { apart, evenGap, type Floors, type Gap, newClash, planPlace, pushFrom, type Rect, tooClose } from "./push"

// 置いた形の定義（表に無い形は null）
export function shapeDefOf(catalog: CoreCatalog, item: string): ShapeItemDef | null {
  const def = catalog.items.get(item)
  return def?.kind === "shape" ? def : null
}

// ページの、2 つの形の組の間隔の下限（線でつながった組は広い。つなぐものの定義が決める）
export const gapOf = (catalog: CoreCatalog, page: ItemPage): Gap => connectorGaps(catalog, page, evenGap)

// 形が変わったあとのページ（つなぐものの定義の整えを全部かける。そのページで効いている設定の値で）
export const tidyPage = <P extends ItemPage>(catalog: CoreCatalog, book: PagedBook, page: P): P =>
  tidyItems(catalog, page, settingsAt(catalog, book, page))

// アイテムの中身のフィールド（項目 props のほかの、id を持つ物の並び。リストの行など）に入っている物の id
function innerIds(item: PlacedItem): string[] {
  return Object.entries(item).flatMap(([key, value]) =>
    key !== "props" && Array.isArray(value)
      ? value.flatMap(c => (typeof (c as { id?: unknown })?.id === "string" ? [(c as { id: string }).id] : []))
      : [],
  )
}

// 次に置くアイテム（リストの行など、中身のフィールドの物も）の id（newId から振る。ブックの全部のページの、アイテムとその中身で重ならない）
export function nextItemId(book: PagedBook, newId: () => string): string {
  return freshId(
    newId,
    book.pages.flatMap(p => pageItemsOf(p).flatMap(i => [i.id, ...innerIds(i)])),
  )
}

// 置く前のアイテムの大きさ（定義の大きさ。表に無いアイテムと、大きさを持たないアイテムは null）
export function itemSize(catalog: CoreCatalog, item: string): Size | null {
  const def = catalog.items.get(item)
  return def?.kind === "shape" ? def.size : null
}

// 大きさを変えられるアイテムの、一番小さい大きさ（変えられないアイテムは null）
export function minSize(catalog: CoreCatalog, item: PlacedShape): Size | null {
  return shapeDefOf(catalog, item.item)?.min ?? null
}

// キャプションが切れずに見える幅（編集で縮めてよい横の下限と、キャプションで広げる幅。表に無いアイテムは 0）
const captionWidth = (catalog: CoreCatalog, item: PlacedShape): number => {
  const def = shapeDefOf(catalog, item.item)
  return def ? (def.captionWidth?.(item) ?? def.size.w) : 0
}

// キャプションが切れずに見える高さ（定義の captionHeight。無ければ null で、縦にはキャプションで広げない）
const captionHeight = (catalog: CoreCatalog, item: PlacedShape): number | null =>
  shapeDefOf(catalog, item.item)?.captionHeight?.(item) ?? null

// つかんだ辺（x は左か右、y は上か下。角なら両方）
export interface Edges {
  x?: "left" | "right"
  y?: "top" | "bottom"
}

// 辺をつかんで、紙の上で by だけ動かしたときの左上と大きさ。つかんでいない辺はそのまま。
// 一番小さい大きさより小さくせず、紙の外へは広げない（変えられないアイテムは null）
export function resizedBy(
  catalog: CoreCatalog,
  item: PlacedShape,
  edges: Edges,
  by: Point,
  paper: Size,
): { x: number; y: number; w: number; h: number } | null {
  const min = minSize(catalog, item)
  const size = placedSize(catalog, item)
  if (!min || !size) return null
  const span = (start: number, len: number, d: number, side: "start" | "end" | undefined, lo: number, max: number) => {
    if (side === "end") return { at: start, len: Math.min(Math.max(len + d, lo), max - start) }
    if (side !== "start") return { at: start, len }
    const end = start + len
    const at = Math.max(Math.min(start + d, end - lo), 0)
    return { at, len: end - at }
  }
  const h = span(item.x, size.w, by.x, edges.x && (edges.x === "left" ? "start" : "end"), min.w, paper.w)
  const v = span(item.y, size.h, by.y, edges.y && (edges.y === "top" ? "start" : "end"), min.h, paper.h)
  return { x: h.at, y: v.at, w: h.len, h: v.len }
}

// 中身を変えた形 next の大きさ: キャプションの項目（定義の captionProp）が変わって、キャプションが見える幅（20 字まで）より狭ければ、そこまで広げる。
// 文字を縦に置く形（定義の captionHeight を持つ形）は、見える高さまで縦にも広げる。
// 広げる向きはブックのタイプの growFrom（無ければ左・上を保って右・下へ。center なら真ん中を保って両側へ）で、紙からははみ出さない。
// 狭めはしない。キャプションが変わらないか、captionProp の無い形ならそのまま
export function widenForCaption(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  before: PlacedShape,
  next: PlacedShape,
): PlacedShape {
  const def = catalog.items.get(next.item)
  const prop = def?.kind === "shape" ? def.captionProp : undefined
  if (prop === undefined) return next
  const caption = (p: PlacedShape) => (p.props as Record<string, unknown>)[prop]
  if (caption(next) === caption(before)) return next
  const size = placedSize(catalog, next)
  const paper = paperSize(catalog, page)
  if (!size || !paper) return next
  const from = catalog.bookTypes.get(book.type)?.growFrom?.(settingsAt(catalog, book, page))
  // 1 つの向きに、want まで広げた位置と長さ（at は左か上、len は今の長さ、room は紙の長さ）
  const grow = (at: number, len: number, want: number, room: number, center: boolean) => {
    const to = Math.min(want, center ? room : room - at)
    if (to <= len) return { at, len }
    return { at: center ? Math.min(Math.max(0, Math.round(at - (to - len) / 2)), room - to) : at, len: to }
  }
  const x = grow(next.x, size.w, captionWidth(catalog, next), paper.w, from?.x === "center")
  const tall = captionHeight(catalog, next)
  const y = tall === null ? { at: next.y, len: size.h } : grow(next.y, size.h, tall, paper.h, from?.y === "center")
  if (x.len === size.w && y.len === size.h) return next
  return { ...next, x: x.at, y: y.at, w: x.len, h: y.len }
}

// 形の個別のテーマ（定義の themeProp が名指す項目）が表にあるか（themeProp の無い形と、値が無いときは true）
export function knownTheme(catalog: CoreCatalog, item: PlacedShape): boolean {
  const def = catalog.items.get(item.item)
  const prop = def?.kind === "shape" ? def.themeProp : undefined
  if (prop === undefined) return true
  const theme = (item.props as Record<string, unknown>)[prop]
  return theme === undefined || (typeof theme === "string" && catalog.themes.has(theme))
}

// 左上 at、大きさ size の四角が、紙からはみ出さないか
export function fitsPaper(at: Point, size: Size, paper: Size): boolean {
  return at.x >= 0 && at.y >= 0 && at.x + size.w <= paper.w && at.y + size.h <= paper.h
}

// ページの紙の大きさ（描けない紙なら null）
export function paperSize(catalog: CoreCatalog, page: ItemPage): Size | null {
  const paper = resolvePaper(catalog, page)
  return paper.status === "unshowable" ? null : paper.size
}

// ページを page に替える。形が変わったあとの線を整えてから（tidyPage）
export function withPage<B extends PagedBook>(catalog: CoreCatalog, book: B, page: ItemPage): B {
  return putPage(book, tidyPage(catalog, book, page))
}

// ページの形とつなぐものを、今の位置で描いたときの外枠（つなぐものは定義の bounds で測る）。何も描かなければ null。
// setting はそのページで効いている設定の値
export function extentOf(catalog: CoreCatalog, page: ItemPage, setting: (id: string) => unknown): Rect | null {
  const rects = rectsOf(catalog, page)
  const boxes: Rect[] = [...rects.values()]
  const areas = portAreasOf(catalog, page, rects)
  const groups = new Map<string, PlacedConnector[]>()
  for (const c of connectorsOf(page)) groups.set(c.item, [...(groups.get(c.item) ?? []), c])
  for (const [id, list] of groups) {
    const def = catalog.items.get(id)
    const b = def?.kind === "connector" ? def.bounds?.(list as ConnectorData[], areas, setting) : null
    if (b) boxes.push(b)
  }
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map(b => b.x))
  const y = Math.min(...boxes.map(b => b.y))
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y }
}

// 形をそのブックに合わせたページ（整列など）: 形に、定義のブックへの合わせ（adapt）をかける。タイプがその形に渡す指定と、
// そのページで効いている設定の値で合わせる（context）。変わらなければそのまま
export function adaptPage<P extends ItemPage>(catalog: CoreCatalog, page: P, context: PageContext): P {
  const options = catalog.bookTypes.get(context.type)?.items.options as Record<string, unknown> | undefined
  let changed = false
  const items = pageItemsOf(page).map(i => {
    if (!isShape(i)) return i
    const def = catalog.items.get(i.item)
    const next =
      def?.kind === "shape" && def.adapt ? (def.adapt(i, options?.[i.item], context.setting) as PlacedShape) : i
    if (next !== i) changed = true
    return next
  })
  return changed ? { ...page, items } : page
}

// 形を並べ直したページ（整列など）: つなぐものに、定義の固定の外し（unpin）を種類ごとにかける（前の並びに合わせて手で決めた形を外す）。
// 変わらなければそのまま
export function unpinPage<P extends ItemPage>(catalog: CoreCatalog, page: P): P {
  const groups = new Map<string, PlacedConnector[]>()
  for (const c of connectorsOf(page)) groups.set(c.item, [...(groups.get(c.item) ?? []), c])
  const unpinned = new Map<string, PlacedConnector>()
  for (const [id, list] of groups) {
    const def = catalog.items.get(id)
    if (def?.kind !== "connector" || !def.unpin) continue
    for (const c of def.unpin(list as ConnectorData[])) unpinned.set(c.id, c as PlacedConnector)
  }
  if (unpinned.size === 0) return page
  return { ...page, items: pageItemsOf(page).map(i => unpinned.get(i.id) ?? i) }
}

// ページにアイテムを置く（id は nextItemId で振ったもの）。重なった相手は右へ、駄目なら下へ押し、それも駄目なら押した列を縮めて右へ・下へ（push.ts の planPlace）。
// 無いページ・はみ出す所・押した相手が収まらないなら null
export function placeItem<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  item: PlacedShape,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(catalog, page)
  const size = placedSize(catalog, item)
  if (!page || !paper || !size) return null
  const after = planPlace(
    rectsOf(catalog, page),
    item.id,
    { x: item.x, y: item.y, ...size },
    paper,
    floorsOf(catalog, page),
    gapOf(catalog, page),
  )
  return after && withPage(catalog, book, { ...page, items: [...placedAt(catalog, page, after), item] })
}

// 描いている形の四角: 形ごとの左上と大きさに、ドラッグでずらして描く量（shift）を足したもの（大きさの分からない形は入れない）
export function shownRects(
  catalog: CoreCatalog,
  shapes: readonly { item: PlacedShape; shift: Point | null }[],
): Map<string, Rect> {
  const rects = new Map<string, Rect>()
  for (const { item, shift } of shapes) {
    const size = placedSize(catalog, item)
    if (size) rects.set(item.id, { x: item.x + (shift?.x ?? 0), y: item.y + (shift?.y ?? 0), ...size })
  }
  return rects
}

// 編集で縮めてよい下限（OVERHAUL の「紙に収める」）: 横がキャプションが全部見える幅、縦が一番低い高さ（箱はキャプション 1 行、リストは見出しと「＋」の行。
// 文字を縦に置く形はキャプションが全部見える高さ）。
// 今それより小さければ今の大きさ
export function floorsOf(catalog: CoreCatalog, page: ItemPage): Floors {
  const floors = new Map<string, Size>()
  for (const i of shapesOf(page)) {
    const size = placedSize(catalog, i)
    if (!size) continue
    floors.set(i.id, {
      w: Math.min(size.w, captionWidth(catalog, i)),
      h: Math.min(size.h, captionHeight(catalog, i) ?? (minSize(catalog, i) ?? size).h),
    })
  }
  return floors
}

// ページのアイテムを next に置き換え、近づきすぎた相手を押してどける（push.ts）。shrink なら、押した列が紙からはみ出すとき縮めて収める。
// 無いページ・無いアイテム・id の違うもの・はみ出す・押した相手が紙に収まらないなら null
export function replacePushing<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  next: PlacedShape,
  shrink: boolean,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(catalog, page)
  const size = placedSize(catalog, next)
  if (!page || !paper || !size || !shapesOf(page).some(i => i.id === next.id)) return null
  const before = rectsOf(catalog, page)
  const gap = gapOf(catalog, page)
  const after = pushFrom(
    before,
    next.id,
    { x: next.x, y: next.y, ...size },
    paper,
    shrink ? floorsOf(catalog, page) : undefined,
    gap,
  )
  if (!after || newClash(before, after, gap)) return null
  const items = placedAt(catalog, page, after).map(i => (i.id === next.id ? next : i))
  return withPage(catalog, book, { ...page, items })
}

// ページのアイテムのうち、形の左上と大きさを四角 rects にしたもの（rects に無い形・変わらない形と線はそのまま。縮めた形は w・h を書く）
export function placedAt(catalog: CoreCatalog, page: ItemPage, rects: ReadonlyMap<string, Rect>): PlacedItem[] {
  return pageItemsOf(page).map(i => {
    if (!isShape(i)) return i
    const r = rects.get(i.id)
    const size = placedSize(catalog, i)
    if (!r || !size) return i
    const at = r.x !== i.x || r.y !== i.y ? { x: r.x, y: r.y } : {}
    const sized = r.w !== size.w || r.h !== size.h ? { w: r.w, h: r.h } : {}
    return Object.keys(at).length + Object.keys(sized).length > 0 ? { ...i, ...at, ...sized } : i
  })
}

// ページのアイテム ids（形も線も）を消す。消した形につながる線も消える（tidyPage）。無いページ・無いアイテムを含むなら null
export function removeItems<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  ids: readonly string[],
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  if (!page) return null
  const items = pageItemsOf(page)
  const targets = new Set(ids)
  if (![...targets].every(id => items.some(i => i.id === id))) return null
  return withPage(catalog, book, { ...page, items: items.filter(i => !targets.has(i.id)) })
}

// ページの形 a と b の組が、間隔の下限（gapOf。線でつないだあとなど）より近ければ、a はそのままで b の側をどける
// （離れていた方の向きへ。押した先も押し、紙の端で詰まれば押された形を縮める）。どけられなければ null。近くなければそのまま
export function keepApart<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  a: string,
  b: string,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(catalog, page)
  if (!page || !paper) return null
  const before = rectsOf(catalog, page)
  const ra = before.get(a)
  const rb = before.get(b)
  const gap = gapOf(catalog, page)
  if (!ra || !rb || a === b || !tooClose(ra, rb, gap(a, b))) return book
  const axis = apart(ra, rb, "x") >= apart(ra, rb, "y") ? "x" : "y"
  const len = axis === "x" ? "w" : "h"
  const ahead = rb[axis] + rb[len] / 2 >= ra[axis] + ra[len] / 2
  const at = ahead ? ra[axis] + ra[len] + gap(a, b) : ra[axis] - gap(a, b) - rb[len]
  const after = pushFrom(before, b, { ...rb, [axis]: at }, paper, floorsOf(catalog, page), gap)
  if (!after || newClash(before, after, gap)) return null
  return withPage(catalog, book, { ...page, items: placedAt(catalog, page, after) })
}
