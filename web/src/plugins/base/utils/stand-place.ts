// スタンドの置き場所: アンカーの四角のどちら側に、どれだけ離して立てるか。入らなければ反対の側へ回し、置ける範囲（スタンドのレイヤー）の中に収める
import type { Point, Rect, Size } from "../../../core/geom"

// corner は右上の角に重ね、edge は上の辺に（すき間を空けずに）乗せる。corner は角のスタンド（corner.tsx）だけが使う
export type StandPlace = "below" | "above" | "right" | "left" | "corner" | "edge"
// プラグイン API の Stand に書ける側（角はコーナーステータスで出す）
export type StandSide = Exclude<StandPlace, "corner">

const GAP = 6 // アンカーとのすき間
export const STAND_MARGIN = 4 // 置ける範囲の端とのすき間

const OPPOSITE: Record<StandPlace, StandPlace> = {
  below: "above",
  above: "below",
  right: "left",
  left: "right",
  corner: "corner",
  edge: "edge",
}

// アンカーの四角 anchor の side に、大きさ size のスタンドを置く左上（area は置ける範囲の大きさ。左上が 0,0）
export function standAt(anchor: Rect, size: Size, area: Size, side: StandPlace): Point {
  const fits = (s: StandPlace) => {
    const p = standBeside(anchor, size, s)
    return (
      p.x >= STAND_MARGIN &&
      p.y >= STAND_MARGIN &&
      p.x + size.w <= area.w - STAND_MARGIN &&
      p.y + size.h <= area.h - STAND_MARGIN
    )
  }
  const chosen = fits(side) || !fits(OPPOSITE[side]) ? side : OPPOSITE[side]
  const p = standBeside(anchor, size, chosen)
  return {
    x: clamp(p.x, STAND_MARGIN, area.w - STAND_MARGIN - size.w),
    y: clamp(p.y, STAND_MARGIN, area.h - STAND_MARGIN - size.h),
  }
}

// 置いたスタンド（左上 at・大きさ size）から見た、アンカーの四角 anchor の向き（左か右）と、スタンドの中で指す高さ y（スタンドの上から）。
// 高さは、アンカーの下の辺とスタンドの下の辺の高い方から inset だけ上（スタンドの上から min より下）。吹き出しの尾をアンカーへ向けるのに使う
export function standFacing(
  anchor: Rect,
  at: Point,
  size: Size,
  inset: number,
  min: number,
): { side: "left" | "right"; y: number } {
  const side = anchor.x + anchor.w / 2 < at.x + size.w / 2 ? "left" : "right"
  const bottom = Math.min(anchor.y + anchor.h, at.y + size.h) - at.y - inset
  return { side, y: clamp(bottom, min, Math.max(min, size.h - inset)) }
}

// アンカーの四角 anchor の上の辺が、見える所 seen の外にあるか（辺が見える所と重ならなければ外）
export function topEdgeOut(anchor: Rect, seen: Rect): boolean {
  return anchor.y < seen.y || anchor.y > seen.y + seen.h || anchor.x + anchor.w < seen.x || anchor.x > seen.x + seen.w
}

// 点 p を、四角 box の端から pad だけ内側に収めた点
export function pointInto(p: Point, box: Rect, pad: number): Point {
  return { x: clamp(p.x, box.x + pad, box.x + box.w - pad), y: clamp(p.y, box.y + pad, box.y + box.h - pad) }
}

// 四角 a と b の重なり（重ならなければ、幅か高さが 0 の四角）
export function intersectRect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  }
}

// 見せる物の上に残す余白: 物の上の辺に乗せるスタンド（伝言やマークの鳥。高さ 48px）が、表示領域の上で切れないように
export const EDGE_STAND_ROOM = 52

// アンカーの四角 anchor を見せるのに、紙をずらす量: 上の辺の上に above の余白を足した四角の真ん中を、置ける範囲の真ん中へ。
// 範囲より大きい向きは、端から pad の所に上の辺（左の辺。上は余白を足した所）をそろえる
export function revealShift(anchor: Rect, area: Size, pad = STAND_MARGIN, above = EDGE_STAND_ROOM): Point {
  const along = (start: number, size: number, view: number) =>
    size > view - 2 * pad ? pad - start : view / 2 - (start + size / 2)
  return { x: along(anchor.x, anchor.w, area.w), y: along(anchor.y - above, anchor.h + above, area.h) }
}

// アンカーの side に立てる左上（置ける範囲に収めない）: 上下に立てるときは左端をそろえ、左右に立てるときは上端をそろえる。角に立てるときは、真ん中を右上の角に置く。辺に乗せるときは左端をそろえる
export function standBeside(a: Rect, size: Size, side: StandPlace): Point {
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
