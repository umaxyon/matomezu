// 図面のページに置いたアイテムの操作（データを書き換えず、新しい値を返す）。
// アイテムは紙から少しでもはみ出す所には置かず、動かさない
import type { Point, Size } from "../../../../core/geom"
import { freshId } from "../../../../core/ids"
import { resolvePaper } from "../../../../core/paper"
import type { Registry } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
import { BOX } from "../box"
import { BOX_MIN, placedHeight, placedWidth } from "../box/size"
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

// 置いたアイテムが、そのページの紙からはみ出さないか
function fitsPage(reg: Registry, page: DrawingPage, item: Placed): boolean {
  const paper = paperSize(reg, page)
  const size = placedSize(reg, item)
  return paper !== null && size !== null && fitsPaper(item, size, paper)
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

// ページにアイテムを置く（id は nextItemId で振ったもの）。無いページ・はみ出す所なら null
export function placeItem(reg: Registry, book: Drawing, pageId: string, item: Placed): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  if (!page || !fitsPage(reg, page, item)) return null
  return withPage(book, { ...page, items: [...itemsOf(page), item] })
}

// ページのアイテムを next に置き換える（id とページの中の順はそのまま）。無いページ・無いアイテム・id の違うもの・はみ出すなら null
export function replaceItem(reg: Registry, book: Drawing, pageId: string, next: Placed): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  if (!page || !itemsOf(page).some(i => i.id === next.id) || !fitsPage(reg, page, next)) return null
  return withPage(book, { ...page, items: itemsOf(page).map(i => (i.id === next.id ? next : i)) })
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

// ページのアイテム ids を by だけ動かす。無いページ・無いアイテム・どれかがはみ出すなら null
export function moveItems(
  reg: Registry,
  book: Drawing,
  pageId: string,
  ids: readonly string[],
  by: Point,
): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  if (!page) return null
  const items = itemsOf(page)
  const targets = new Set(ids)
  if (![...targets].every(id => items.some(i => i.id === id))) return null
  const moved = items.map(i => (targets.has(i.id) ? { ...i, x: i.x + by.x, y: i.y + by.y } : i))
  const fit = moved.every(i => !targets.has(i.id) || fitsPage(reg, page, i))
  return fit ? withPage(book, { ...page, items: moved }) : null
}
