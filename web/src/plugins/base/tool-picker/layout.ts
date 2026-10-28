// 道具のアイコンの置き方（画面の px）。基本はポインタの上に横並び、上端で入らなければ下。
// 左右の端で横に入らなければ縦並びにして、右端ならポインタの左（left）、左端なら右（right）
import type { Point, Rect, Size } from "../../../core/geom"

export const ICON = 40 // アイコンの大きさ
const GAP = 6 // アイコンの間
const AWAY = 16 // ポインタからの離れ
const MARGIN = 6 // 画面の端との間
const LEAVE_DIST = 80 // アイコンの並び（ミニマップなら、その枠）からこれより離れたら、押さずに閉じる
const PASS_DIST = 40 // ポインタから見てアイコンの向こう側へ、これより通り過ぎたら閉じる

export type Lay = "row" | "left" | "right"

export interface PickerLayout {
  slots: Point[] // アイコンの左上
  lay: Lay
}

// n 個のアイコンを at の近くに置く。上に並べるのは、もう 1 段分（アイコン 1 つと間）入るときだけ
export function pickerSlots(at: Point, n: number, view: Size): PickerLayout {
  const span = n * ICON + (n - 1) * GAP
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
  const lay: Lay = at.x + span / 2 > view.w - MARGIN ? "left" : at.x - span / 2 < MARGIN ? "right" : "row"
  if (lay !== "row") {
    const x = lay === "left" ? at.x - AWAY - ICON : at.x + AWAY
    const top = clamp(at.y - span / 2, MARGIN, view.h - span - MARGIN)
    return { lay, slots: Array.from({ length: n }, (_, i) => ({ x, y: top + i * (ICON + GAP) })) }
  }
  const above = at.y - AWAY - 2 * ICON - GAP >= MARGIN
  const y = above ? at.y - AWAY - ICON : at.y + AWAY
  const left = at.x - span / 2
  return { lay, slots: Array.from({ length: n }, (_, i) => ({ x: left + i * (ICON + GAP), y })) }
}

// ミニマップのボタンの左上: 並びの外側（ポインタと反対の側）の、並びの真ん中（アイコンが偶数なら、真ん中の 2 つの間）。上の並びは、もう 1 段分入るときだけなので収まる
export function mapSlot(layout: PickerLayout, at: Point): Point {
  const first = layout.slots[0] ?? at
  const last = layout.slots[layout.slots.length - 1] ?? at
  const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }
  if (layout.lay === "left") return { x: mid.x - ICON - GAP, y: mid.y }
  if (layout.lay === "right") return { x: mid.x + ICON + GAP, y: mid.y }
  return { x: mid.x, y: mid.y < at.y ? mid.y - ICON - GAP : mid.y + ICON + GAP }
}

// その場に出すミニマップ（大きさ size）の左上: 並び layout があった所に、ポインタ at と反対の側へ広げて置き、画面 view からはみ出すなら内へ寄せる
export function mapPlace(layout: PickerLayout, at: Point, size: Size, view: Size): Point {
  const xs = layout.slots.map(s => s.x)
  const ys = layout.slots.map(s => s.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const x1 = Math.max(...xs) + ICON
  const y1 = Math.max(...ys) + ICON
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const p =
    layout.lay === "left"
      ? { x: x1 - size.w, y: cy - size.h / 2 }
      : layout.lay === "right"
        ? { x: x0, y: cy - size.h / 2 }
        : { x: cx - size.w / 2, y: y1 <= at.y ? y1 - size.h : y0 }
  const clamp = (v: number, len: number, room: number) => Math.max(MARGIN, Math.min(v, room - len - MARGIN))
  return { x: clamp(p.x, size.w, view.w), y: clamp(p.y, size.h, view.h) }
}

// ポインタ p がアイコンの並びから離れたか（並びから LEAVE_DIST より遠いか、ポインタから見て向こう側へ PASS_DIST より通り過ぎたか）
export function leftPicker(layout: PickerLayout, at: Point, p: Point): boolean {
  const xs = layout.slots.map(s => s.x)
  const ys = layout.slots.map(s => s.y)
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: 0, h: 0 }
  box.w = Math.max(...xs) + ICON - box.x
  box.h = Math.max(...ys) + ICON - box.y
  return leftBox(box, layout.lay, at, p)
}

// ポインタ p が四角 box（アイコンの並びか、その場に出したミニマップ。並べ方 lay で、ポインタ at から広げた物）から離れたか
export function leftBox(box: Rect, lay: Lay, at: Point, p: Point): boolean {
  const x0 = box.x
  const y0 = box.y
  const x1 = box.x + box.w
  const y1 = box.y + box.h
  const past = lay === "left" ? x0 - p.x : lay === "right" ? p.x - x1 : y1 <= at.y ? y0 - p.y : p.y - y1
  return farFrom(box, p) || past > PASS_DIST
}

// ポインタ p が四角 box から LEAVE_DIST より遠いか
export function farFrom(box: Rect, p: Point): boolean {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.w))
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.h))
  return Math.hypot(dx, dy) > LEAVE_DIST
}
