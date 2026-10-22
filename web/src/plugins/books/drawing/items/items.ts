// 図面のページに置いたアイテムの操作（データを書き換えず、新しい値を返す）。
// アイテムは紙から少しでもはみ出す所には置かず、動かさない。置いた・動かした・大きさか左上が変わったアイテムは、近づきすぎた相手をどける（push.ts）
import type { Point, Size } from "../../../../core/geom"
import { freshId } from "../../../../core/ids"
import { resolvePaper } from "../../../../core/paper"
import type { Registry } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
import { BOX } from "../box"
import { BOX_MIN, placedHeight, placedWidth } from "../box/size"
import { type Came, dragRects, dropManyRects, dropRects, track } from "./drag"
import { newClash, planPlace, pushFrom, type Rect } from "./push"
import type { DrawingPage, Placed } from "./schema"

type Drawing = BookOf<"drawing">

// 置こうとしているアイテムの左上を、ポインタから左上へこれだけ離す（画面の px）
export const PLACE_OFFSET: Point = { x: 16, y: 12 }

export const itemsOf = (page: DrawingPage): readonly Placed[] => page.items ?? []

// 次に置くアイテムの id（newId から振る。ブックの全部のページで重ならない）
export function nextItemId(book: Drawing, newId: () => string): string {
  return freshId(
    newId,
    book.pages.flatMap(p => itemsOf(p).map(i => i.id)),
  )
}

// 置く前のアイテムの大きさ（定義の大きさ。表に無いアイテムは null）
export function itemSize(reg: Registry, item: string): Size | null {
  return reg.items.get(item)?.size ?? null
}

// 置いたアイテムの大きさ。w・h（無ければ定義の大きさ。箱は置いたときの幅と高さ）
export function placedSize(reg: Registry, item: Placed): Size | null {
  const size = itemSize(reg, item.item)
  if (!size) return null
  const w = item.w ?? (item.item === BOX.id ? placedWidth(item.props) : size.w)
  return { w, h: item.h ?? (item.item === BOX.id ? placedHeight(item.props, w) : size.h) }
}

// 大きさを変えられるアイテムの、一番小さい大きさ（変えられないアイテムは null）
export function minSize(item: Placed): Size | null {
  return item.item === BOX.id ? BOX_MIN : null
}

// つかんだ辺（x は左か右、y は上か下。角なら両方）
export interface Edges {
  x?: "left" | "right"
  y?: "top" | "bottom"
}

// 辺をつかんで、紙の上で by だけ動かしたときの左上と大きさ。つかんでいない辺はそのまま。
// 一番小さい大きさより小さくせず、紙の外へは広げない（変えられないアイテムは null）
export function resizedBy(
  reg: Registry,
  item: Placed,
  edges: Edges,
  by: Point,
  paper: Size,
): { x: number; y: number; w: number; h: number } | null {
  const min = minSize(item)
  const size = placedSize(reg, item)
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

// 中身を変えた箱 next の幅: キャプションが変わって、置いたときの幅（20 字まで）より狭ければ、そこまで右へ広げる（紙の右の端で止める）。
// 狭めはしない。箱でないか、キャプションが変わらなければそのまま
export function widenForCaption(reg: Registry, page: DrawingPage, before: Placed, next: Placed): Placed {
  if (next.item !== BOX.id || before.item !== BOX.id || next.props.caption === before.props.caption) return next
  const size = placedSize(reg, next)
  const paper = paperSize(reg, page)
  if (!size || !paper) return next
  const w = Math.min(placedWidth(next.props), paper.w - next.x)
  return w > size.w ? { ...next, w } : next
}

// アイテムに当てたテーマが表にあるか（当てていなければ true）
export function knownTheme(reg: Registry, item: Placed): boolean {
  return item.props.theme === undefined || reg.themes.has(item.props.theme)
}

// 左上 at、大きさ size の四角が、紙からはみ出さないか
export function fitsPaper(at: Point, size: Size, paper: Size): boolean {
  return at.x >= 0 && at.y >= 0 && at.x + size.w <= paper.w && at.y + size.h <= paper.h
}

// ページの紙の大きさ（描けない紙なら null）
function paperSize(reg: Registry, page: DrawingPage): Size | null {
  const paper = resolvePaper(reg, page)
  return paper.status === "unshowable" ? null : paper.size
}

function withPage(book: Drawing, page: DrawingPage): Drawing {
  return { ...book, pages: book.pages.map(p => (p.id === page.id ? page : p)) }
}

// ページにアイテムを置く（id は nextItemId で振ったもの）。重なった相手は右へ、駄目なら下へ押す（push.ts の planPlace）。
// 無いページ・はみ出す所・押した相手が収まらないなら null
export function placeItem(reg: Registry, book: Drawing, pageId: string, item: Placed): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(reg, page)
  const size = placedSize(reg, item)
  if (!page || !paper || !size) return null
  const after = planPlace(rectsOf(reg, page), item.id, { x: item.x, y: item.y, ...size }, paper)
  return after && withPage(book, { ...page, items: [...placedAt(itemsOf(page), after), item] })
}

// ページのアイテムの四角（大きさの分からないアイテムは入れない）
export function rectsOf(reg: Registry, page: DrawingPage): Map<string, Rect> {
  const rects = new Map<string, Rect>()
  for (const i of itemsOf(page)) {
    const size = placedSize(reg, i)
    if (size) rects.set(i.id, { x: i.x, y: i.y, ...size })
  }
  return rects
}

// ページのアイテムを next に置き換え、近づきすぎた相手を押してどける（push.ts）。
// 無いページ・無いアイテム・id の違うもの・はみ出す・押した相手が紙に収まらないなら null
export function replacePushing(reg: Registry, book: Drawing, pageId: string, next: Placed): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(reg, page)
  const size = placedSize(reg, next)
  if (!page || !paper || !size || !itemsOf(page).some(i => i.id === next.id)) return null
  const before = rectsOf(reg, page)
  const after = pushFrom(before, next.id, { x: next.x, y: next.y, ...size }, paper)
  if (!after || newClash(before, after)) return null
  const items = placedAt(itemsOf(page), after).map(i => (i.id === next.id ? next : i))
  return withPage(book, { ...page, items })
}

// アイテムの左上を、四角 rects の左上にする（rects に無いアイテム・同じ左上のアイテムはそのまま）
function placedAt(items: readonly Placed[], rects: ReadonlyMap<string, Rect>): Placed[] {
  return items.map(i => {
    const r = rects.get(i.id)
    return r && (r.x !== i.x || r.y !== i.y) ? { ...i, x: r.x, y: r.y } : i
  })
}

// ドラッグ中のアイテム id の通り道を覚え直す（drag.ts の track）
export function trackDrag(reg: Registry, page: DrawingPage, id: string, prev: Point, by: Point, came: Came): Came {
  return track(rectsOf(reg, page), id, prev, by, came)
}

// ドラッグ中の、全部のアイテムの四角（drag.ts の dragRects。動かすアイテムと、その場で入れ替えた相手だけが動く）。描けない紙なら null
export function dragging(
  reg: Registry,
  page: DrawingPage,
  id: string,
  by: Point,
  came: Came,
): Map<string, Rect> | null {
  const paper = paperSize(reg, page)
  return paper && dragRects(rectsOf(reg, page), id, by, came, paper)
}

// ページのアイテム ids を消す。無いページ・無いアイテムを含むなら null
export function removeItems(book: Drawing, pageId: string, ids: readonly string[]): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  if (!page) return null
  const items = itemsOf(page)
  const targets = new Set(ids)
  if (![...targets].every(id => items.some(i => i.id === id))) return null
  return withPage(book, { ...page, items: items.filter(i => !targets.has(i.id)) })
}

// ページのアイテム ids を by だけ動かす（drag.ts。1 つなら入れ替え・向こう側へ寄せる・手前へ戻す、何個かならまとめて手前へ戻す）。
// came はドラッグの通り道で覚えた、相手ごとの先端が来た向き（無ければ始めの位置から見た向き）。無いページ・無いアイテム・収まらないなら null
export function moveItems(
  reg: Registry,
  book: Drawing,
  pageId: string,
  ids: readonly string[],
  by: Point,
  came?: Came,
): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(reg, page)
  if (!page || !paper) return null
  const before = rectsOf(reg, page)
  if (!ids.every(id => before.has(id))) return null
  const after =
    ids.length === 1
      ? dropRects(before, ids[0] as string, by, came, paper)
      : dropManyRects(before, new Set(ids), by, paper)
  return after && withPage(book, { ...page, items: placedAt(itemsOf(page), after) })
}
