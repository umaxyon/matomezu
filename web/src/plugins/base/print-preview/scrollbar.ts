// 印刷プレビューのスクロールバーの決まり（見た目を持たない計算）: 向きごとの、中身の長さ content・表示領域の長さ view・ずらす量 pan
// （0 から view - content。core の viewport の形）から、つまみの位置と長さ（溝の長さに対する割合）と、溝を押したとき・つまみを
// ドラッグしたときに目指すずらす量を決める。範囲に収めるのはステージ（ここでは収めない）
import type { Size } from "../../../core/geom"

export interface ScrollAxis {
  content: number
  view: number
  pan: number
}

// つまみの位置 offset と長さ length（溝の長さに対する割合）
export function thumbOf(axis: ScrollAxis): { offset: number; length: number } {
  return { offset: -axis.pan / axis.content, length: Math.min(1, axis.view / axis.content) }
}

// 長さ track の溝の at（溝の頭から px）を押したとき、そこがつまみの真ん中になるずらす量
export function panForTrack(axis: ScrollAxis, track: number, at: number): number {
  const { length } = thumbOf(axis)
  return -(at / track - length / 2) * axis.content
}

// つまみを押したときのずらす量 start から、ポインタを溝の上で moved（px）動かしたときに目指すずらす量
// （押した時点からの量で決める。範囲の端で止まっても、ポインタとつまみがずれない）
export const panForDrag = (axis: ScrollAxis, track: number, start: number, moved: number): number =>
  start - (moved / track) * axis.content

// バーを出すか: 縦は中身が表示領域の高さを超えるとき、横は並べた印刷区画そのもの（area に倍率 zoom）が表示領域の幅を超えるときだけ
// （周りの余白の分だけずらせるときは出さない）
export function shownBars(area: Size, zoom: number, view: Size, content: Size): { x: boolean; y: boolean } {
  return { y: content.h > view.h, x: area.w * zoom > view.w }
}
