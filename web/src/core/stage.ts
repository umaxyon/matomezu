// ステージ: 画面の見える領域の 1 区画。ブックのページを 1 つ開き、表示領域の大きさ・倍率・ずらす量を持つ。
// ずらす量は、いつも範囲に収めた値で持つ（収めるのはここの操作だけで、描く側は直さない）。
// 操作はデータを書き換えず、新しい値を返す（変わらなければ同じものを返す）
import type { Point, Size } from "./geom"
import { DEFAULT_PAPER, PAPERS } from "./paper"
import { clampPan, contentSize, paperOrigin } from "./viewport"

export interface Stage {
  id: string
  book: string // ブックの id
  page: string // ページの id
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

export function newStage(id: string, book: string, page: string): Stage {
  return { id, book, page, zoom: 1, pan: HOME, view: null }
}

// ステージに出す紙
export function paperOf(_stage: Stage): Size {
  return PAPERS[DEFAULT_PAPER]
}

// ずらす量を pan にして、範囲に収める
function settle(stage: Stage, pan: Point): Stage {
  const next = stage.view ? clampPan(stage.view, contentSize(paperOf(stage), stage.zoom), pan) : pan
  return next.x === stage.pan.x && next.y === stage.pan.y ? stage : { ...stage, pan: next }
}

export function resize(stage: Stage, view: Size): Stage {
  if (stage.view && stage.view.w === view.w && stage.view.h === view.h) return stage
  return settle({ ...stage, view }, stage.pan)
}

export function panBy(stage: Stage, dx: number, dy: number): Stage {
  return settle(stage, { x: stage.pan.x + dx, y: stage.pan.y + dy })
}

// 同じブックのページを開く。ずらす量は最初の位置に戻す
export function openPage(stage: Stage, page: string): Stage {
  if (stage.page === page) return stage
  return settle({ ...stage, page }, HOME)
}

export function placement(stage: Stage): Placement {
  const paper = paperOf(stage)
  const origin = paperOrigin(stage.pan)
  return { x: origin.x, y: origin.y, w: paper.w, h: paper.h, zoom: stage.zoom }
}
