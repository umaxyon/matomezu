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
  selection: readonly string[] // 選んでいる物の id（開いているページのアイテムや、ページのフィールドの中の物）
  editing: boolean // 選んでいる物を、今その場で編集中か（選びが替わる・開くものが変わる・道具を替えると終わる）
  // 開いている道具のアイコン（at は出す所の画面の座標。null なら画面が決める。map ならアイコンの代わりにミニマップを出している）
  picker: { at: Point | null; map: boolean } | null
  minimap: boolean // ステージの左下にミニマップを出しているか（紙が表示領域に収まると閉じる）
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
  return {
    id,
    opened,
    zoom: 1,
    pan: HOME,
    view: null,
    placing: null,
    selection: NONE,
    editing: false,
    picker: null,
    minimap: false,
  }
}

// 開くものが変わったときに、置こうとしているアイテムと選択を捨て（その場の編集も終える）、道具のアイコンを閉じる
function leave(stage: Stage): Stage {
  if (stage.placing === null && stage.selection.length === 0 && stage.picker === null && !stage.editing) return stage
  return { ...stage, placing: null, selection: NONE, editing: false, picker: null }
}

// ステージに出す紙の大きさ（ページを開いていないか、描けない紙なら null）
export function paperOf(stage: Pick<Stage, "opened">): Size | null {
  const paper = stage.opened?.paper
  return paper && paper.status !== "unshowable" ? paper.size : null
}

// 紙が表示領域に収まらず、ずらして見る所があるか（紙の周りの余白は数えない。表示領域を測るまでは無い）
export function scrolls(stage: Pick<Stage, "opened" | "view" | "zoom">): boolean {
  const paper = paperOf(stage)
  const view = stage.view
  if (!paper || !view) return false
  return paper.w * stage.zoom > view.w || paper.h * stage.zoom > view.h
}

// ずらす量を pan にして、範囲に収める。紙が収まればミニマップを閉じる（また収まらなくなっても、自分では開かない）
function settle(stage: Stage, pan: Point): Stage {
  const paper = paperOf(stage)
  const next = stage.view && paper ? clampPan(stage.view, contentSize(paper, stage.zoom), pan) : pan
  const minimap = stage.minimap && (stage.view === null || scrolls(stage))
  if (next.x === stage.pan.x && next.y === stage.pan.y && minimap === stage.minimap) return stage
  return { ...stage, pan: next, minimap }
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
export function openBook(catalog: CoreCatalog, stage: Stage, book: Book): Stage {
  if (!hasPages(book)) {
    if (stage.opened?.book === book.id) return stage
    return settle(leave({ ...stage, opened: { type: book.type, book: book.id, page: null, paper: null } }), HOME)
  }
  const first = book.pages[0]
  const opened = {
    type: book.type,
    book: book.id,
    page: first?.id ?? null,
    paper: first ? resolvePaper(catalog, first) : null,
  }
  return settle(leave({ ...stage, opened }), HOME)
}

// 開いているブックのページを開く（開いているブックの、あるページだけ）。ずらす量は最初の位置に戻す
export function openPage(catalog: CoreCatalog, stage: Stage, book: PagedBook, page: string): Stage {
  const o = stage.opened
  const found = book.pages.find(p => p.id === page)
  if (!o || o.book !== book.id || !found || o.page === page) return stage
  return settle(leave({ ...stage, opened: { ...o, page, paper: resolvePaper(catalog, found) } }), HOME)
}

// 開いているブックが変わったときに合わせる。開いていたページが残っていればそのページ（紙は決め直す）、
// 無くなっていれば隣のページ（変わる前のブック before で後ろにあったページ、無ければ前のページ。before が無ければ最初のページ。ページが無ければ開かない）。
// ページが変わったときだけ、ずらす量を最初の位置に戻し、選択を捨てる。そのブックを開いていなければ、同じ値を返す
export function followBook(catalog: CoreCatalog, stage: Stage, book: Book, before?: Book): Stage {
  const o = stage.opened
  if (!o || o.book !== book.id || !hasPages(book)) return stage
  const found = book.pages.find(p => p.id === o.page) ?? neighbourOf(book, o.page, before)
  const page = found?.id ?? null
  const paper = found ? resolvePaper(catalog, found) : null
  if (page === o.page && JSON.stringify(paper) === JSON.stringify(o.paper)) return stage
  const opened = { ...o, page, paper }
  return page === o.page ? settle({ ...stage, opened }, stage.pan) : settle(leave({ ...stage, opened }), HOME)
}

// 無くなったページ page の隣: 変わる前のブックで後ろにあった残りのページ、無ければ前にあった残りのページ（分からなければ最初のページ）
function neighbourOf(book: PagedBook, page: string | null, before?: Book): PagedBook["pages"][number] | undefined {
  const was = before && hasPages(before) ? before.pages.map(p => p.id) : []
  const at = page === null ? -1 : was.indexOf(page)
  if (at < 0) return book.pages[0]
  const left = new Map(book.pages.map(p => [p.id, p]))
  const after = was.slice(at + 1).find(id => left.has(id))
  const prior = was
    .slice(0, at)
    .reverse()
    .find(id => left.has(id))
  return left.get(after ?? prior ?? "") ?? book.pages[0]
}

// 倍率を zoom にする。表示領域の中の点 at（無ければ真ん中）の下にある紙の点が動かないように、ずらす量を合わせる（紙が無ければ変えない）
export function zoomTo(stage: Stage, zoom: number, at?: Point): Stage {
  if (!paperOf(stage) || zoom === stage.zoom) return stage
  const view = stage.view
  if (!view) return settle({ ...stage, zoom }, stage.pan)
  const p = at ?? { x: view.w / 2, y: view.h / 2 }
  const origin = paperOrigin(stage.pan)
  const k = zoom / stage.zoom
  const pan = { x: stage.pan.x + (p.x - origin.x) * (1 - k), y: stage.pan.y + (p.y - origin.y) * (1 - k) }
  return settle({ ...stage, zoom }, pan)
}

// 開いたときの見え方（倍率 1、ずらす量は最初の位置）に戻す
export function resetView(stage: Stage): Stage {
  return stage.zoom === 1 ? settle(stage, HOME) : settle({ ...stage, zoom: 1 }, HOME)
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
  return paperOf(stage) ? { ...stage, picker: { at, map: false } } : stage
}

// 開いている道具のアイコンを、ミニマップに替える（開いていなければ何もしない）
export function showPickerMap(stage: Stage): Stage {
  return stage.picker && !stage.picker.map ? { ...stage, picker: { ...stage.picker, map: true } } : stage
}

// ステージの左下のミニマップを開く・閉じる（紙が収まっていれば開かない）
export function setMinimap(stage: Stage, open: boolean): Stage {
  const next = open && scrolls(stage)
  return next === stage.minimap ? stage : { ...stage, minimap: next }
}

export function closePicker(stage: Stage): Stage {
  return stage.picker === null ? stage : { ...stage, picker: null }
}

// 選ぶ物を替える（替われば、その場の編集は終える）
export function select(stage: Stage, ids: readonly string[]): Stage {
  const same = ids.length === stage.selection.length && ids.every((id, i) => stage.selection[i] === id)
  return same ? stage : { ...stage, selection: ids.length === 0 ? NONE : [...ids], editing: false }
}

// 選んでいる物を、その場で編集し始める・終える（何も選んでいなければ始めない）
export function setEditing(stage: Stage, editing: boolean): Stage {
  const next = editing && stage.selection.length > 0
  return next === stage.editing ? stage : { ...stage, editing: next }
}

// 紙の置き場所（何も開いていなければ null）
export function placement(stage: Pick<Stage, "opened" | "pan" | "zoom">): Placement | null {
  const paper = paperOf(stage)
  if (!paper) return null
  const origin = paperOrigin(stage.pan)
  return { x: origin.x, y: origin.y, w: paper.w, h: paper.h, zoom: stage.zoom }
}

// 表示領域の中の点（左上から）を、紙の上の点に直す（紙が無ければ null）
export function toPaper(stage: Pick<Stage, "opened" | "pan" | "zoom">, p: Point): Point | null {
  const at = placement(stage)
  if (!at) return null
  return { x: (p.x - at.x) / at.zoom, y: (p.y - at.y) / at.zoom }
}

// 画面の上で動いた量を、紙の上で動いた量に直す
export function toPaperDelta(stage: Pick<Stage, "zoom">, d: Point): Point {
  return { x: d.x / stage.zoom, y: d.y / stage.zoom }
}
