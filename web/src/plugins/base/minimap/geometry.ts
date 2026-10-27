// ミニマップの計算（紙の座標と、ステージのずらす量の行き来）
import type { Point, Rect, Size } from "../../../core/geom"
import { MARGIN } from "../../../core/viewport"

// ステージの表示領域 view で見えている紙の範囲（紙の座標。紙の外は切る。見えていなければ null）
export function seenRect(paper: Size, view: Size, pan: Point, zoom: number): Rect | null {
  const x0 = Math.max(0, -(pan.x + MARGIN) / zoom)
  const y0 = Math.max(0, -(pan.y + MARGIN) / zoom)
  const x1 = Math.min(paper.w, (view.w - pan.x - MARGIN) / zoom)
  const y1 = Math.min(paper.h, (view.h - pan.y - MARGIN) / zoom)
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

// 見えている範囲の左上を紙の点 at（紙の座標）にするずらす量（範囲に収めるのはステージの側）
export function panFor(at: Point, zoom: number): Point {
  return { x: -at.x * zoom - MARGIN, y: -at.y * zoom - MARGIN }
}

// 紙 paper を幅 w・高さ h に収める倍率
export function fitScale(paper: Size, w: number, h: number): number {
  return Math.min(w / Math.max(1, paper.w), h / Math.max(1, paper.h))
}

// 押した所 p（紙の座標）で、見えている範囲 seen をつかむ: 範囲の外なら p が真ん中に来る所へ飛ぶ（to）。
// grab は、つかんだ所の範囲の左上からのずれ（ドラッグの間、これを保って動かす）
export function grabAt(seen: Rect, p: Point): { to: Point | null; grab: Point } {
  const inside = p.x >= seen.x && p.x <= seen.x + seen.w && p.y >= seen.y && p.y <= seen.y + seen.h
  if (inside) return { to: null, grab: { x: p.x - seen.x, y: p.y - seen.y } }
  return { to: { x: p.x - seen.w / 2, y: p.y - seen.h / 2 }, grab: { x: seen.w / 2, y: seen.h / 2 } }
}
