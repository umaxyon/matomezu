// 右サイドパネルで開いた物を見せる見え方: 倍率を 100% にして、物の四角が表示領域に余白を残して入るまでずらす（もう入っていればずらさない）。
// 物が表示領域より大きい向きは、物の左上を見せる。物がリストなどの中のスクロールの奥にあれば、そのスクロールを動かす量も決める
import type { Rect } from "../../../core/geom"
import { panBy, placement, type Stage, toPaper, toPaperDelta, zoomTo } from "../../../core/stage"
import { paperOrigin } from "../../../core/viewport"
import type { ViewAt } from "../zoom"

const PAD = 24 // 物の周りに残す表示領域の余白（px）

// 物の始まり start と長さ size を、長さ view の所に、両端に余白 pad を残して入れるのに物を動かす量（入りきらないか前にはみ出せば始まりを、後ろにはみ出せば終わりをそろえる）
function shiftInto(start: number, size: number, view: number, pad: number): number {
  if (size > view - 2 * pad || start < pad) return pad - start
  if (start + size > view - pad) return view - pad - start - size
  return 0
}

// ステージ stage で、紙の上の四角 rect の物を見せる見え方（紙か表示領域が無ければ、今の見え方）。倍率は物の真ん中を動かさずに 100% にする
export function revealView(stage: Stage, rect: Rect): ViewAt {
  const at = placement(stage)
  const view = stage.view
  if (!at || !view) return { zoom: stage.zoom, pan: stage.pan }
  const center = { x: at.x + (rect.x + rect.w / 2) * at.zoom, y: at.y + (rect.y + rect.h / 2) * at.zoom }
  const zoomed = zoomTo(stage, 1, center)
  const origin = paperOrigin(zoomed.pan)
  const shown = panBy(
    zoomed,
    shiftInto(origin.x + rect.x, rect.w, view.w, PAD),
    shiftInto(origin.y + rect.y, rect.h, view.h, PAD),
  )
  return { zoom: shown.zoom, pan: shown.pan }
}

// 表示領域の上で測った四角 measured（表示領域の左上から）を、ステージ stage の紙の上の四角に直したもの（紙が無ければ null）
export function paperRectOf(stage: Stage, measured: Rect): Rect | null {
  const at = toPaper(stage, measured)
  if (!at) return null
  const size = toPaperDelta(stage, { x: measured.w, y: measured.h })
  return { x: at.x, y: at.y, w: size.x, h: size.y }
}

// 中のスクロールを動かす量（スクロールの長さで）: 画面の上で、見える所の始まりから start にある長さ size の物を、見える長さ seen（スクロールの長さ）の中に入れる。
// scale は画面の上の長さ ÷ スクロールの長さ（倍率の分）。入りきらないか前にはみ出せば始まりに、後ろにはみ出せば終わりにそろえる（スクロールは物と逆に動く）
export const scrollShift = (start: number, size: number, seen: number, scale: number): number =>
  0 - shiftInto(start / scale, size / scale, seen, 0) // 0 から引くのは、-0 にしないため
