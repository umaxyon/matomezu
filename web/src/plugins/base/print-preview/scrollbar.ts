// 印刷プレビューのスクロールバーの決まり（見た目を持たない計算）: 向きごとの、中身の長さ content・表示領域の長さ view・ずらす量 pan
// （0 から view - content。core の viewport の形）と溝の長さ track（px）から、つまみの位置と長さ（溝の長さに対する割合）と、溝を押したとき・
// つまみをドラッグしたときに目指すずらす量を決める。つまみの長さは見えている割合で、THUMB_MIN より短くはしない（位置は溝の残りの長さで割り振る）。
// 範囲に収めるのはステージ（ここでは収めない）
import type { Size } from "../../../core/geom"

export const THUMB_MIN = 24 // つまみの長さの下限（px）

export interface ScrollAxis {
  content: number
  view: number
  pan: number
}

// ずらせる長さ（中身が表示領域からはみ出す長さ）
const room = (axis: ScrollAxis): number => Math.max(0, axis.content - axis.view)

// つまみの位置 offset と長さ length（溝の長さに対する割合）
export function thumbOf(axis: ScrollAxis, track: number): { offset: number; length: number } {
  const length = Math.min(1, Math.max(axis.view / axis.content, THUMB_MIN / track))
  const r = room(axis)
  return { offset: r > 0 ? (-axis.pan / r) * (1 - length) : 0, length }
}

// つまみが溝の上で動ける長さ（px）1 つあたりの、ずらす量
const perPx = (axis: ScrollAxis, track: number): number => {
  const free = track * (1 - thumbOf(axis, track).length)
  return free > 0 ? room(axis) / free : 0
}

// 溝の at（溝の頭から px）を押したとき、そこがつまみの真ん中になるずらす量
export function panForTrack(axis: ScrollAxis, track: number, at: number): number {
  const thumb = thumbOf(axis, track).length * track
  return -(at - thumb / 2) * perPx(axis, track)
}

// つまみを押したときのずらす量 start から、ポインタを溝の上で moved（px）動かしたときに目指すずらす量
// （押した時点からの量で決める。範囲の端で止まっても、ポインタとつまみがずれない）
export const panForDrag = (axis: ScrollAxis, track: number, start: number, moved: number): number =>
  start - moved * perPx(axis, track)

// バーを出すか: 並べた印刷区画そのもの（area に倍率 zoom）が表示領域からはみ出す向きだけ（周りの余白の分だけずらせるときは出さない）
export function shownBars(area: Size, zoom: number, view: Size): { x: boolean; y: boolean } {
  return { x: area.w * zoom > view.w, y: area.h * zoom > view.h }
}
