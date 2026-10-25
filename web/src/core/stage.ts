// ステージ: 画面の見える領域の 1 区画。ブックを 1 つ開くか、何も開いていない。ページを持つタイプのブックはページを 1 つ開き
// （ページが無ければ開かない）、開いたページの紙を置く。表示領域の大きさ・倍率・ずらす量と、置こうとしているアイテム・選択を持つ
// （道具はステージではなく、道具の組ごとに窓が持つ。core/tools.ts）。
// ずらす量は、いつも範囲に収めた値で持つ（収めるのはここの操作だけで、描く側は直さない）。
// 操作はデータを書き換えず、新しい値を返す（変わらなければ同じものを返す）

import { hasPages, type PagedBook } from "./book"
import type { ItemId } from "./catalog"
import type { BookTypeId, CoreCatalog } from "./core-catalog"
import type { Point, Size } from "./geom"
import { type ResolvedPaper, resolvePaper } from "./paper"
import type { Book } from "./schema/book"
import { clampPan, contentSize, paperOrigin } from "./viewport"

// 開いているブック。ブックのタイプと、開いたページの紙を写して持つ（開くときに決まる）
export interface Opened {
  type: BookTypeId
  book: string // ブックの id
  page: string | null // 開いているページの id（ページを持たないタイプと、ページが無いブックは null）
  paper: ResolvedPaper | null // 開いているページの描く紙（ページを開いていなければ null）
}

export interface Stage {
  id: string
  opened: Opened | null // 何も開いていなければ null
  zoom: number
  pan: Point // ずらす量（viewport.ts）
  view: Size | null // 表示領域の大きさ（測るまでは null）
  placing: ItemId | null // 置こうとしているアイテム（ツールボックスで選んだもの。置くか取り消すまで）
  selection: readonly string[] // 選んでいるアイテムの id（開いているページのもの）
  picker: { at: Point | null } | null // 開いている道具のアイコン（at は出す所の画面の座標。null なら画面が決める）
}

// 紙を置く位置（表示領域の左上から）と、倍率をかける前の大きさ
export interface Placement {
  x: number
  y: number
  w: number
  h: number
  zoom: number
}

const HOME: Point = { x: 0, y: 0 }
const NONE: readonly string[] = []

export function newStage(id: string, opened: Opened | null = null): Stage {
  return { id, opened, zoom: 1, pan: HOME, view: null, placing: null, selection: NONE, picker: null }
}

// 開くものが変わったときに、置こうとしているアイテムと選択を捨て、道具のアイコンを閉じる
function leave(stage: Stage): Stage {
  if (stage.placing === null && stage.selection.length === 0 && stage.picker === null) return stage
  return { ...stage, placing: null, selection: NONE, picker: null }
}

// ステージに出す紙の大きさ（ページを開いていないか、描けない紙なら null）
export function paperOf(stage: Stage): Size | null {
  const paper = stage.opened?.paper
  return paper && paper.status !== "unshowable" ? paper.size : null
}

// ずらす量を pan にして、範囲に収める
function settle(stage: Stage, pan: Point): Stage {
  const paper = paperOf(stage)
  const next = stage.view && paper ? clampPan(stage.view, contentSize(paper, stage.zoom), pan) : pan
  return next.x === stage.pan.x && next.y === stage.pan.y ? stage : { ...stage, pan: next }
}

export function resize(stage: Stage, view: Size): Stage {
  if (stage.view && stage.view.w === view.w && stage.view.h === view.h) return stage
  return settle({ ...stage, view }, stage.pan)
}

// 紙が無ければずらさない
export function panBy(stage: Stage, dx: number, dy: number): Stage {
  if (!paperOf(stage)) return stage
  return settle(stage, { x: stage.pan.x + dx, y: stage.pan.y + dy })
}

// ブックを開く（ページを持つなら最初のページ）。ずらす量は最初の位置に戻す。
// ページを持たないブックがもう開いていれば、同じ値を返す
export function openBook(reg: CoreCatalog, stage: Stage, book: Book): Stage {
  if (!hasPages(book)) {
    if (stage.opened?.book === book.id) return stage
    return settle(leave({ ...stage, opened: { type: book.type, book: book.id, page: null, paper: null } }), HOME)
  }
  const first = book.pages[0]
  const opened = {
    type: book.type,
    book: book.id,
    page: first?.id ?? null,
    paper: first ? resolvePaper(reg, first) : null,
  }
  return settle(leave({ ...stage, opened }), HOME)
}

// 開いているブックのページを開く（開いているブックの、あるページだけ）。ずらす量は最初の位置に戻す
export function openPage(reg: CoreCatalog, stage: Stage, book: PagedBook, page: string): Stage {
  const o = stage.opened
  const found = book.pages.find(p => p.id === page)
  if (!o || o.book !== book.id || !found || o.page === page) return stage
  return settle(leave({ ...stage, opened: { ...o, page, paper: resolvePaper(reg, found) } }), HOME)
}

// 開いているブックが変わったときに合わせる。開いていたページが残っていればそのページ（紙は決め直す）、
// 無くなっていれば最初のページ（ページが無ければ開かない）。ページが変わったときだけ、ずらす量を最初の位置に戻し、選択を捨てる。
// そのブックを開いていなければ、同じ値を返す
export function followBook(reg: CoreCatalog, stage: Stage, book: Book): Stage {
  const o = stage.opened
  if (!o || o.book !== book.id || !hasPages(book)) return stage
  const found = book.pages.find(p => p.id === o.page) ?? book.pages[0]
  const page = found?.id ?? null
  const paper = found ? resolvePaper(reg, found) : null
  if (page === o.page && JSON.stringify(paper) === JSON.stringify(o.paper)) return stage
  const opened = { ...o, page, paper }
  return page === o.page ? settle({ ...stage, opened }, stage.pan) : settle(leave({ ...stage, opened }), HOME)
}

// 何も開いていない状態にする（開いていたブックが無くなったときなど）
export function closeBook(stage: Stage): Stage {
  return stage.opened ? settle(leave({ ...stage, opened: null }), HOME) : stage
}

// アイテムを置こうとする。同じアイテムをもう一度選べば取り消す（道具を選択にするのは workspace.ts の togglePlacing）
export function togglePlacing(stage: Stage, item: ItemId): Stage {
  return { ...stage, placing: stage.placing === item ? null : item }
}

export function stopPlacing(stage: Stage): Stage {
  return stage.placing === null ? stage : { ...stage, placing: null }
}

// 道具のアイコンを開く（紙が無ければ開かない）・閉じる
export function openPicker(stage: Stage, at: Point | null): Stage {
  return paperOf(stage) ? { ...stage, picker: { at } } : stage
}

export function closePicker(stage: Stage): Stage {
  return stage.picker === null ? stage : { ...stage, picker: null }
}

export function select(stage: Stage, ids: readonly string[]): Stage {
  const same = ids.length === stage.selection.length && ids.every((id, i) => stage.selection[i] === id)
  return same ? stage : { ...stage, selection: ids.length === 0 ? NONE : [...ids] }
}

// 紙の置き場所（何も開いていなければ null）
export function placement(stage: Stage): Placement | null {
  const paper = paperOf(stage)
  if (!paper) return null
  const origin = paperOrigin(stage.pan)
  return { x: origin.x, y: origin.y, w: paper.w, h: paper.h, zoom: stage.zoom }
}

// 表示領域の中の点（左上から）を、紙の上の点に直す（紙が無ければ null）
export function toPaper(stage: Stage, p: Point): Point | null {
  const at = placement(stage)
  if (!at) return null
  return { x: (p.x - at.x) / at.zoom, y: (p.y - at.y) / at.zoom }
}

// 画面の上で動いた量を、紙の上で動いた量に直す
export function toPaperDelta(stage: Stage, d: Point): Point {
  return { x: d.x / stage.zoom, y: d.y / stage.zoom }
}
