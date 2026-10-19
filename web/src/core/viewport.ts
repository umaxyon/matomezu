// ステージの中での紙の見え方。
// 紙の周りに余白を取ったもの（中身）を、表示領域の中でずらして見る。ずらす量（pan）は、表示領域の左上から見た中身の左上の位置。
// 中身が表示領域に収まる向きは真ん中に置き、収まらない向きは中身の端が表示領域の内側に入らない範囲でだけずらせる
import type { Point, Size } from "./geom"

export const MARGIN = 88 // 紙の周りの余白（px。倍率をかけない）

export function contentSize(paper: Size, zoom: number): Size {
  return { w: paper.w * zoom + 2 * MARGIN, h: paper.h * zoom + 2 * MARGIN }
}

function clampAxis(view: number, content: number, pan: number): number {
  if (content <= view) return (view - content) / 2
  return Math.min(0, Math.max(view - content, pan))
}

export function clampPan(view: Size, content: Size, pan: Point): Point {
  return { x: clampAxis(view.w, content.w, pan.x), y: clampAxis(view.h, content.h, pan.y) }
}

// 紙の左上の位置（表示領域の左上から）
export function paperOrigin(pan: Point): Point {
  return { x: pan.x + MARGIN, y: pan.y + MARGIN }
}
