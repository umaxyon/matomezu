// 図面のページに置いたアイテムの操作（データを書き換えず、新しい値を返す）。
// アイテムは紙から少しでもはみ出す所には置かず、動かさない。置いた・動かした・大きさか左上が変わったアイテムは、近づきすぎた相手をどける（push.ts）
import type { Point, Size } from "../../../../core/geom"
import { freshId } from "../../../../core/ids"
import { resolvePaper } from "../../../../core/paper"
import type { Registry } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
import { type DrawingPage, type Placed, placedDef } from "../placed"
import { type Came, dragRects, dropManyRects, dropRects, track } from "./drag"
import { type Floors, newClash, planPlace, pushFrom, type Rect } from "./push"

type Drawing = BookOf<"drawing">

// 置こうとしているアイテムの左上を、ポインタから左上へこれだけ離す（画面の px）
export const PLACE_OFFSET: Point = { x: 16, y: 12 }

export const itemsOf = (page: DrawingPage): readonly Placed[] => page.items ?? []

// 次に置くアイテム（リストの行も）の id（newId から振る。ブックの全部のページの、アイテムとその中身で重ならない）
export function nextItemId(book: Drawing, newId: () => string): string {
  return freshId(
    newId,
    book.pages.flatMap(p =>
      itemsOf(p).flatMap(i => [i.id, ...("children" in i ? (i.children ?? []).map(c => c.id) : [])]),
    ),
  )
}

// 置く前のアイテムの大きさ（定義の大きさ。表に無いアイテムは null）
export function itemSize(reg: Registry, item: string): Size | null {
  return reg.items.get(item)?.size ?? null
}

// 置いたアイテムの大きさ。w・h（無ければ置いたときの幅と高さ。アイテムの置き方が決める）。表に無いアイテムは null
export function placedSize(reg: Registry, item: Placed): Size | null {
  return itemSize(reg, item.item) ? placedDef(item).size(item) : null
}

// 大きさを変えられるアイテムの、一番小さい大きさ（変えられないアイテムは null）
export function minSize(item: Placed): Size | null {
  return placedDef(item).min ?? null
}

// キャプションが切れずに見える幅（編集で縮めてよい横の下限と、キャプションで広げる幅）
const captionWidth = (item: Placed): number => placedDef(item).captionWidth(item)

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

// 中身を変えた箱・リスト next の幅: キャプションが変わって、キャプションが見える幅（20 字まで）より狭ければ、そこまで右へ広げる（紙の右の端で止める）。
// 狭めはしない。キャプションが変わらなければそのまま
export function widenForCaption(reg: Registry, page: DrawingPage, before: Placed, next: Placed): Placed {
  if (next.props.caption === before.props.caption) return next
  const size = placedSize(reg, next)
  const paper = paperSize(reg, page)
  if (!size || !paper) return next
  const w = Math.min(captionWidth(next), paper.w - next.x)
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

// ページにアイテムを置く（id は nextItemId で振ったもの）。重なった相手は右へ、駄目なら下へ押し、それも駄目なら押した列を縮めて右へ・下へ（push.ts の planPlace）。
// 無いページ・はみ出す所・押した相手が収まらないなら null
export function placeItem(reg: Registry, book: Drawing, pageId: string, item: Placed): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(reg, page)
  const size = placedSize(reg, item)
  if (!page || !paper || !size) return null
  const after = planPlace(rectsOf(reg, page), item.id, { x: item.x, y: item.y, ...size }, paper, floorsOf(reg, page))
  return after && withPage(book, { ...page, items: [...placedAt(reg, itemsOf(page), after), item] })
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

// 編集で縮めてよい下限（OVERHAUL の「紙に収める」）: 横がキャプションが全部見える幅、縦が一番低い高さ（箱はキャプション 1 行、リストは見出しと「＋」の行）。
// 今それより小さければ今の大きさ
function floorsOf(reg: Registry, page: DrawingPage): Floors {
  const floors = new Map<string, Size>()
  for (const i of itemsOf(page)) {
    const size = placedSize(reg, i)
    if (!size) continue
    floors.set(i.id, { w: Math.min(size.w, captionWidth(i)), h: Math.min(size.h, (minSize(i) ?? size).h) })
  }
  return floors
}

// ページのアイテムを next に置き換え、近づきすぎた相手を押してどける（push.ts）。shrink なら、押した列が紙からはみ出すとき縮めて収める。
// 無いページ・無いアイテム・id の違うもの・はみ出す・押した相手が紙に収まらないなら null
export function replacePushing(
  reg: Registry,
  book: Drawing,
  pageId: string,
  next: Placed,
  shrink: boolean,
): Drawing | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && paperSize(reg, page)
  const size = placedSize(reg, next)
  if (!page || !paper || !size || !itemsOf(page).some(i => i.id === next.id)) return null
  const before = rectsOf(reg, page)
  const after = pushFrom(
    before,
    next.id,
    { x: next.x, y: next.y, ...size },
    paper,
    shrink ? floorsOf(reg, page) : undefined,
  )
  if (!after || newClash(before, after)) return null
  const items = placedAt(reg, itemsOf(page), after).map(i => (i.id === next.id ? next : i))
  return withPage(book, { ...page, items })
}

// アイテムの左上と大きさを、四角 rects にする（rects に無いアイテム・変わらないアイテムはそのまま。縮めたアイテムは w・h を書く）
function placedAt(reg: Registry, items: readonly Placed[], rects: ReadonlyMap<string, Rect>): Placed[] {
  return items.map(i => {
    const r = rects.get(i.id)
    const size = placedSize(reg, i)
    if (!r || !size) return i
    const at = r.x !== i.x || r.y !== i.y ? { x: r.x, y: r.y } : {}
    const sized = r.w !== size.w || r.h !== size.h ? { w: r.w, h: r.h } : {}
    return Object.keys(at).length + Object.keys(sized).length > 0 ? { ...i, ...at, ...sized } : i
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
  return after && withPage(book, { ...page, items: placedAt(reg, itemsOf(page), after) })
}
