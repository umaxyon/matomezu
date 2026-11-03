// 右サイドパネルで開いた物を見せる見え方: 倍率を決めて（1 つの物なら 100%、いくつかの物を囲む四角なら、余白を残して入る倍率を ZOOM_MIN～100% で）、
// 四角の真ん中を表示領域の真ん中へずらす（ずらす量は、マークポインタを押したときと同じ stand-place.ts の revealShift。表示領域より大きい向きは、上・左の端をそろえる）
import type { Rect } from "../../../core/geom"
import { panBy, placement, type Stage, toPaper, toPaperDelta, zoomTo } from "../../../core/stage"
import { revealShift } from "../utils/stand-place"
import { fitZoom, type ViewAt } from "../zoom"

// 物の周りに残す表示領域の余白（px）。マークポインタのずらし（スタンドと端のすき間 STAND_MARGIN）より広く取り、見せた物が表示領域の端に付かないようにする
const PAD = 24

// 見せるときの倍率: one は 100%、fit は四角が入る倍率（100% まで）、keep は今の倍率のまま
export type RevealZoom = "one" | "fit" | "keep"

// ステージ stage で、紙の上の四角 rect を見せる見え方（紙か表示領域が無ければ、今の見え方）。倍率は zoom で決め、
// 四角の真ん中を動かさずに変えてから、真ん中へずらす（紙の端で、ずらせる所まで）
export function revealView(stage: Stage, rect: Rect, zoom: RevealZoom = "one"): ViewAt {
  const at = placement(stage)
  const view = stage.view
  if (!at || !view) return { zoom: stage.zoom, pan: stage.pan }
  const center = { x: at.x + (rect.x + rect.w / 2) * at.zoom, y: at.y + (rect.y + rect.h / 2) * at.zoom }
  const to = zoom === "fit" ? fitZoom(rect, view, PAD, 1) : zoom === "keep" ? stage.zoom : 1
  const zoomed = zoomTo(stage, to, center)
  const now = placement(zoomed) ?? at
  const shown = {
    x: now.x + rect.x * now.zoom,
    y: now.y + rect.y * now.zoom,
    w: rect.w * now.zoom,
    h: rect.h * now.zoom,
  }
  const by = revealShift(shown, view, PAD)
  const moved = panBy(zoomed, by.x, by.y)
  return { zoom: moved.zoom, pan: moved.pan }
}

// 表示領域の上で測った四角 measured（表示領域の左上から）を、ステージ stage の紙の上の四角に直したもの（紙が無ければ null）
export function paperRectOf(stage: Stage, measured: Rect): Rect | null {
  const at = toPaper(stage, measured)
  if (!at) return null
  const size = toPaperDelta(stage, { x: measured.w, y: measured.h })
  return { x: at.x, y: at.y, w: size.x, h: size.y }
}
