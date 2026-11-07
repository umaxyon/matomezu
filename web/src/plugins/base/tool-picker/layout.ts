// 道具のアイコンの置き方（画面の px）。基本はポインタの上に横並び、上端で入らなければ下。
// 左右の端で横に入らなければ縦並びにして、右端ならポインタの左（left）、左端なら右（right）。
// 組の初めの道具（ブックを開いたときの道具）は並びの真ん中（偶数なら真ん中の前の方）に置き、ほかは組の順で残りの所に置く。
// ミニマップ（大きさ map）は並びの外側（ポインタと反対の側）に並びと一緒に置く。上に並べるのは、ミニマップまで入るときだけ。
// 上にも下にも（縦並びなら外側の横に）入らなければ、ミニマップは出さず、アイコンだけを並べる
import type { Point, Rect, Size } from "../../../core/geom"

export const ICON = 40 // アイコンの大きさ
const GAP = 6 // アイコンの間
const AWAY = 16 // ポインタからの離れ
const MARGIN = 6 // 画面の端との間
const LEAVE_DIST = 80 // アイコンの並びとミニマップを合わせた枠からこれより離れたら、押さずに閉じる
const PASS_DIST = 40 // ポインタから見てアイコンの向こう側へ、これより通り過ぎたら閉じる

export type Lay = "row" | "left" | "right"

export interface PickerLayout {
  slots: Point[] // アイコンの左上（組の順）
  lay: Lay
  map: Rect | null // ミニマップの枠（入らなければ null）
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))

// n 個のアイコンと、大きさ map のミニマップを at の近くに置く
export function pickerSlots(at: Point, n: number, map: Size, view: Size): PickerLayout {
  const span = n * ICON + (n - 1) * GAP
  const lay: Lay = at.x + span / 2 > view.w - MARGIN ? "left" : at.x - span / 2 < MARGIN ? "right" : "row"
  if (lay !== "row") {
    const x = lay === "left" ? at.x - AWAY - ICON : at.x + AWAY
    const top = clamp(at.y - span / 2, MARGIN, view.h - span - MARGIN)
    const slots = firstInMiddle(Array.from({ length: n }, (_, i) => ({ x, y: top + i * (ICON + GAP) })))
    const mx = lay === "left" ? x - GAP - map.w : x + ICON + GAP
    const fits = mx >= MARGIN && mx + map.w <= view.w - MARGIN && map.h <= view.h - 2 * MARGIN
    const my = clamp(top + span / 2 - map.h / 2, MARGIN, view.h - map.h - MARGIN)
    return { lay, slots, map: fits ? { x: mx, y: my, ...map } : null }
  }
  const left = at.x - span / 2
  const row = (y: number) => firstInMiddle(Array.from({ length: n }, (_, i) => ({ x: left + i * (ICON + GAP), y })))
  const mx = clamp(at.x - map.w / 2, MARGIN, view.w - map.w - MARGIN)
  const up = at.y - AWAY - ICON
  if (up - GAP - map.h >= MARGIN) return { lay, slots: row(up), map: { x: mx, y: up - GAP - map.h, ...map } }
  const down = at.y + AWAY
  if (down + ICON + GAP + map.h <= view.h - MARGIN)
    return { lay, slots: row(down), map: { x: mx, y: down + ICON + GAP, ...map } }
  // ミニマップが入らない: アイコンを上に並べるのは、もう 1 段分（アイコン 1 つと間）入るときだけ
  return { lay, slots: row(up - ICON - GAP >= MARGIN ? up : down), map: null }
}

// 並んだ所 places を、組の順に置き直す: 初めの道具に真ん中の所、ほかの道具に残りの所を並びの順で
function firstInMiddle(places: Point[]): Point[] {
  const mid = Math.floor((places.length - 1) / 2)
  const middle = places[mid]
  return middle ? [middle, ...places.filter((_, i) => i !== mid)] : places
}

// ポインタ p がアイコンの並びとミニマップから離れたか（合わせた枠から LEAVE_DIST より遠いか、ポインタから見て向こう側へ PASS_DIST より通り過ぎたか）
export function leftPicker(layout: PickerLayout, at: Point, p: Point): boolean {
  const boxes = [...layout.slots.map(s => ({ x: s.x, y: s.y, w: ICON, h: ICON })), ...(layout.map ? [layout.map] : [])]
  const x = Math.min(...boxes.map(b => b.x))
  const y = Math.min(...boxes.map(b => b.y))
  const w = Math.max(...boxes.map(b => b.x + b.w)) - x
  const h = Math.max(...boxes.map(b => b.y + b.h)) - y
  return leftBox({ x, y, w, h }, layout.lay, at, p)
}

// ポインタ p が四角 box（並べ方 lay で、ポインタ at から広げた物）から離れたか
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
