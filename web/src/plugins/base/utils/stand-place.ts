// スタンドの置き場所: アンカーの四角のどちら側に、どれだけ離して立てるか。入らなければ反対の側へ回し、置ける範囲（スタンドのレイヤー）の中に収める
import type { Point, Rect, Size } from "../../../core/geom"

// corner は右上の角に重ね、edge は上の辺に（すき間を空けずに）乗せる
export type StandSide = "below" | "above" | "right" | "left" | "corner" | "edge"

const GAP = 6 // アンカーとのすき間
const MARGIN = 4 // 置ける範囲の端とのすき間

const OPPOSITE: Record<StandSide, StandSide> = {
  below: "above",
  above: "below",
  right: "left",
  left: "right",
  corner: "corner",
  edge: "edge",
}

// アンカーの四角 anchor の side に、大きさ size のスタンドを置く左上（area は置ける範囲の大きさ。左上が 0,0）
export function standAt(anchor: Rect, size: Size, area: Size, side: StandSide): Point {
  const fits = (s: StandSide) => {
    const p = besides(anchor, size, s)
    return p.x >= MARGIN && p.y >= MARGIN && p.x + size.w <= area.w - MARGIN && p.y + size.h <= area.h - MARGIN
  }
  const chosen = fits(side) || !fits(OPPOSITE[side]) ? side : OPPOSITE[side]
  const p = besides(anchor, size, chosen)
  return { x: clamp(p.x, MARGIN, area.w - MARGIN - size.w), y: clamp(p.y, MARGIN, area.h - MARGIN - size.h) }
}

// アンカーの四角 anchor の上の辺が、置ける範囲（大きさ area。左上が 0,0）の外にあるか（辺が範囲と重ならなければ外）
export function topOut(anchor: Rect, area: Size): boolean {
  return anchor.y < 0 || anchor.y > area.h || anchor.x + anchor.w < 0 || anchor.x > area.w
}

// 点 p を、置ける範囲の端から pad だけ内側に収めた点
export function pointInto(p: Point, area: Size, pad: number): Point {
  return { x: clamp(p.x, pad, area.w - pad), y: clamp(p.y, pad, area.h - pad) }
}

// アンカーの side に立てる左上（置ける範囲に収めない）
export const standBeside = (anchor: Rect, size: Size, side: StandSide): Point => besides(anchor, size, side)

// 上下に立てるときは左端をそろえ、左右に立てるときは上端をそろえる。角に立てるときは、真ん中を右上の角に置く。辺に乗せるときは左端をそろえる
function besides(a: Rect, size: Size, side: StandSide): Point {
  switch (side) {
    case "below":
      return { x: a.x, y: a.y + a.h + GAP }
    case "above":
      return { x: a.x, y: a.y - GAP - size.h }
    case "right":
      return { x: a.x + a.w + GAP, y: a.y }
    case "left":
      return { x: a.x - GAP - size.w, y: a.y }
    case "corner":
      return { x: a.x + a.w - size.w / 2, y: a.y - size.h / 2 }
    case "edge":
      return { x: a.x, y: a.y - size.h }
  }
}

// 収める範囲より大きければ、左上を優先する
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi))

// 四角をまとめて囲む四角
export function unionRect(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map(r => r.x))
  const y = Math.min(...rects.map(r => r.y))
  const right = Math.max(...rects.map(r => r.x + r.w))
  const bottom = Math.max(...rects.map(r => r.y + r.h))
  return { x, y, w: right - x, h: bottom - y }
}
