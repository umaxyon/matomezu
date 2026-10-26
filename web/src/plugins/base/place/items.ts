// ページに置いたアイテムの操作（データを書き換えず、新しい値を返す）。
// アイテムは紙から少しでもはみ出す所には置かず、動かさない。置いた・動かした・大きさか左上が変わったアイテムは、近づきすぎた相手をどける（push.ts）。
// 形が変わったあとは、ページのつなぐものの決まりで整える（core/placed.ts の tidyPage）
import { type PagedBook, putPage } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ShapeItemDef } from "../../../core/def/item"
import type { Point, Size } from "../../../core/geom"
import { freshId } from "../../../core/ids"
import { resolvePaper } from "../../../core/paper"
import {
  gapOf as connectorGaps,
  type ItemPage,
  isShape,
  type PlacedItem,
  type PlacedShape,
  pageItemsOf,
  placedSize,
  rectsOf,
  shapesOf,
  tidyPage as tidyItems,
} from "../../../core/placed"
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

// アイテムの中身の欄（項目 props のほかの、id を持つ物の並び。リストの行など）に入っている物の id
function innerIds(item: PlacedItem): string[] {
  return Object.entries(item).flatMap(([key, value]) =>
    key !== "props" && Array.isArray(value)
      ? value.flatMap(c => (typeof (c as { id?: unknown })?.id === "string" ? [(c as { id: string }).id] : []))
      : [],
  )
}

// 次に置くアイテム（リストの行など、中身の欄の物も）の id（newId から振る。ブックの全部のページの、アイテムとその中身で重ならない）
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

// 中身を変えた形 next の幅: 文字を持つ形（hasText）のキャプションが変わって、キャプションが見える幅（20 字まで）より狭ければ、そこまで右へ広げる（紙の右の端で止める）。
// 狭めはしない。キャプションが変わらないか、文字を持たない形ならそのまま
export function widenForCaption(
  catalog: CoreCatalog,
  page: ItemPage,
  before: PlacedShape,
  next: PlacedShape,
): PlacedShape {
  if (next.props.caption === before.props.caption) return next
  if (!catalog.items.get(next.item)?.capabilities.includes("hasText")) return next
  const size = placedSize(catalog, next)
  const paper = paperSize(catalog, page)
  if (!size || !paper) return next
  const w = Math.min(captionWidth(catalog, next), paper.w - next.x)
  return w > size.w ? { ...next, w } : next
}

// アイテムに当てたテーマが表にあるか（当てていなければ true）
export function knownTheme(catalog: CoreCatalog, item: PlacedShape): boolean {
  // 形が theme の欄を持つかを土台が知らないまま読んでいる（監査 B1。形の約束で直すまで、欄があるものとして読む）
  const theme = (item.props as { theme?: string }).theme
  return theme === undefined || catalog.themes.has(theme)
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

// 編集で縮めてよい下限（OVERHAUL の「紙に収める」）: 横がキャプションが全部見える幅、縦が一番低い高さ（箱はキャプション 1 行、リストは見出しと「＋」の行）。
// 今それより小さければ今の大きさ
export function floorsOf(catalog: CoreCatalog, page: ItemPage): Floors {
  const floors = new Map<string, Size>()
  for (const i of shapesOf(page)) {
    const size = placedSize(catalog, i)
    if (!size) continue
    floors.set(i.id, {
      w: Math.min(size.w, captionWidth(catalog, i)),
      h: Math.min(size.h, (minSize(catalog, i) ?? size).h),
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
