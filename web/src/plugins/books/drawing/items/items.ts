// 図面のページに置いたアイテムの操作（データを書き換えず、新しい値を返す）。
// アイテムは紙から少しでもはみ出す所には置かず、動かさない
import type { Point, Size } from "../../../../core/geom"
import { freshId } from "../../../../core/ids"
import { resolvePaper } from "../../../../core/paper"
import type { Registry } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
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

// アイテムの大きさ（表に無いアイテムは null）
export function itemSize(reg: Registry, item: string): Size | null {
  return reg.items.get(item)?.size ?? null
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
  const size = itemSize(reg, item.item)
  const paper = page && paperSize(reg, page)
  if (!page || !size || !paper || !fitsPaper(item, size, paper)) return null
  return withPage(book, { ...page, items: [...itemsOf(page), item] })
}

// ページのアイテムを next に置き換える（id とページの中の順はそのまま）。無いページ・無いアイテム・id の違うものなら null
export function replaceItem(book: Drawing, pageId: string, next: Placed): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  if (!page || !itemsOf(page).some(i => i.id === next.id)) return null
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
  const paper = page && paperSize(reg, page)
  if (!page || !paper) return null
  const items = itemsOf(page)
  const targets = new Set(ids)
  if (![...targets].every(id => items.some(i => i.id === id))) return null
  const moved = items.map(i => (targets.has(i.id) ? { ...i, x: i.x + by.x, y: i.y + by.y } : i))
  const fit = moved.every(i => {
    const size = itemSize(reg, i.item)
    return !targets.has(i.id) || (size !== null && fitsPaper(i, size, paper))
  })
  return fit ? withPage(book, { ...page, items: moved }) : null
}
