// ステージ: 画面の見える領域の 1 区画。ブックを 1 つ開くか、何も開いていない。ページを持つタイプのブックはページを 1 つ開き、
// タイプが紙を決めていれば紙を置く。表示領域の大きさ・倍率・ずらす量を持つ。
// ずらす量は、いつも範囲に収めた値で持つ（収めるのはここの操作だけで、描く側は直さない）。
// 操作はデータを書き換えず、新しい値を返す（変わらなければ同じものを返す）

import { hasPages } from "./book"
import type { Point, Size } from "./geom"
import { PAPERS } from "./paper"
import { type BookTypeId, bookType } from "./registry"
import type { Book } from "./schema/book"
import { clampPan, contentSize, paperOrigin } from "./viewport"

// 開いているブック。ブックのタイプを写して持つ（ブックのタイプは変わらない）
export interface Opened {
  type: BookTypeId
  book: string // ブックの id
  page: string | null // 開いているページの id（ページを持たないタイプは null）
}

export interface Stage {
  id: string
  opened: Opened | null // 何も開いていなければ null
  zoom: number
  pan: Point // ずらす量（viewport.ts）
  view: Size | null // 表示領域の大きさ（測るまでは null）
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

export function newStage(id: string, opened: Opened | null = null): Stage {
  return { id, opened, zoom: 1, pan: HOME, view: null }
}

// ステージに出す紙（開いたブックのタイプが紙を決めていなければ null）
export function paperOf(stage: Stage): Size | null {
  const paper = stage.opened && bookType(stage.opened.type).paper
  return paper ? PAPERS[paper] : null
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
export function openBook(stage: Stage, book: Book): Stage {
  if (!hasPages(book)) {
    if (stage.opened?.book === book.id) return stage
    return settle({ ...stage, opened: { type: book.type, book: book.id, page: null } }, HOME)
  }
  const first = book.pages[0]
  if (!first) return stage
  return settle({ ...stage, opened: { type: book.type, book: book.id, page: first.id } }, HOME)
}

// 開いているブックのページを開く（ページを持たないブックでは何もしない）。ずらす量は最初の位置に戻す
export function openPage(stage: Stage, page: string): Stage {
  const o = stage.opened
  if (!o || o.page === null || o.page === page) return stage
  return settle({ ...stage, opened: { ...o, page } }, HOME)
}

// 紙の置き場所（何も開いていなければ null）
export function placement(stage: Stage): Placement | null {
  const paper = paperOf(stage)
  if (!paper) return null
  const origin = paperOrigin(stage.pan)
  return { x: origin.x, y: origin.y, w: paper.w, h: paper.h, zoom: stage.zoom }
}
