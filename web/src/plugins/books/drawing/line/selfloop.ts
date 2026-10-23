// 自分に戻る線（自己ループ）の形。DOM は触らない純粋な関数。
// 2 つの端（箱のふちの上の点）を通る円の、箱の外を回る側の弧を描く（折れ線の点に分ける）。
// 端の位置の指定が無ければ、箱の角に描く。既定は右上で、輪の範囲がほかの箱や線とぶつかるなら、
// 右上 → 左上 → 右下 → 左下の順に空いている角を選ぶ。
// 端の位置（exitAt / enterAt）は、箱のふちを左上から時計回りに一周した割合（0〜1）。2 つの端は、同じ辺か
// 隣り合う辺に置く（向かいの辺だと円が箱を横切るため。その指定は使わず、角に描く）

import type { Point } from "../../../../core/geom"
import { centerOf, nearestAt, pointAt, type Rect, rectsOverlap, segmentsOf, segmentThroughRect } from "./geom"

export type { Rect }
export type Corner = "topRight" | "topLeft" | "bottomRight" | "bottomLeft"
type Side = "t" | "r" | "b" | "l"

const CORNERS: Corner[] = ["topRight", "topLeft", "bottomRight", "bottomLeft"]
const STEPS = 36 // 弧を分ける数
const MARGIN = 4 // ほかの箱とのすき間

// 箱のふちを左上から時計回りに一周する道（端の位置の割合はこの上で測る）
export const perimeter = (r: Rect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
  { x: r.x, y: r.y },
]

// 割合 f の点がある辺（角はその点から時計回りに進む辺）
function sideAt(r: Rect, f: number): Side {
  const d = (((f % 1) + 1) % 1) * 2 * (r.w + r.h)
  return d < r.w ? "t" : d < r.w + r.h ? "r" : d < 2 * r.w + r.h ? "b" : "l"
}
const OPPOSITE: Record<Side, Side> = { t: "b", b: "t", l: "r", r: "l" }

// side の辺と、その両隣の辺をたどる道（もう一方の端がその辺にあるとき、この端が動ける範囲）
function around(r: Rect, side: Side): Point[] {
  const tl: Point = { x: r.x, y: r.y },
    tr: Point = { x: r.x + r.w, y: r.y },
    br: Point = { x: r.x + r.w, y: r.y + r.h },
    bl: Point = { x: r.x, y: r.y + r.h }
  return { t: [bl, tl, tr, br], r: [tl, tr, br, bl], b: [tr, br, bl, tl], l: [br, bl, tl, tr] }[side]
}

// a から b へ、2 点を通る円の、箱の外を回る側の弧。中心は 2 点を結ぶ線の真ん中から、箱から離れる向きへ
// 2 点の間の長さだけ出す（角に描くときは、角の斜め外に中心が来る）。この円は辺の延長と、箱の外でもう一度ずつ
// 交わるだけなので、2 点が同じ辺か隣り合う辺にあれば、弧は箱の中に入らない
function arc(r: Rect, a: Point, b: Point): Point[] {
  let { x: bx, y: by } = b
  if (Math.hypot(bx - a.x, by - a.y) < 2) {
    bx += 4
    by += 4
  } // 同じ点なら少しずらす
  const len = Math.hypot(bx - a.x, by - a.y)
  const m: Point = { x: (a.x + bx) / 2, y: (a.y + by) / 2 }
  let n: Point = { x: (by - a.y) / len, y: -(bx - a.x) / len }
  const { x: cx, y: cy } = centerOf(r)
  const out: Point = { x: m.x - cx, y: m.y - cy }
  if (n.x * out.x + n.y * out.y < 0) n = { x: -n.x, y: -n.y }
  const c: Point = { x: m.x + n.x * len, y: m.y + n.y * len }
  const R = Math.hypot(a.x - c.x, a.y - c.y)
  const ang = (p: Point) => Math.atan2(p.y - c.y, p.x - c.x)
  const a0 = ang(a),
    a3 = ang({ x: bx, y: by }),
    af = Math.atan2(n.y, n.x) // af は一番外の点の向き
  const TAU = 2 * Math.PI
  const span = (from: number, to: number, dir: number) => ((((to - from) * dir) % TAU) + TAU) % TAU
  const dir = span(a0, af, 1) < span(a0, a3, 1) ? 1 : -1 // 一番外の点を通る向きに回る
  const sweep = span(a0, a3, dir)
  const pts: Point[] = []
  for (let i = 0; i <= STEPS; i++) {
    const t = a0 + dir * sweep * (i / STEPS)
    pts.push({ x: c.x + R * Math.cos(t), y: c.y + R * Math.sin(t) })
  }
  pts[0] = { ...a }
  pts[STEPS] = { x: bx, y: by }
  return pts
}

// 角の輪の両端。index は同じ箱の何本目か（2 本目以降は輪を大きくして重ねない）
function cornerEnds(r: Rect, corner: Corner, index: number): [Point, Point] {
  const right = corner === "topRight" || corner === "bottomRight"
  const top = corner === "topRight" || corner === "topLeft"
  const cx = right ? r.x + r.w : r.x,
    cy = top ? r.y : r.y + r.h
  const hx = right ? 1 : -1,
    vy = top ? -1 : 1 // 角から外へ向かう向き
  const s = Math.min(16 + 9 * index, r.w / 2, r.h / 2) // 角からの距離（箱が小さいときも辺の上に収める）
  return [
    { x: cx - hx * s, y: cy },
    { x: cx, y: cy - vy * s },
  ]
}

// 点の並びの範囲（箱の上にある両端は除く）
function bounds(pts: Point[]): Rect {
  const inner = pts.slice(1, -1)
  const xs = inner.map(p => p.x),
    ys = inner.map(p => p.y)
  const x = Math.min(...xs),
    y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

const hits = (a: Rect, b: Rect) => rectsOverlap(a, b, MARGIN)
// 線（点の並び）のどこかの区間が、矩形を通るか（折れ点が矩形の外でも、横切っていれば通る）
const crosses = (b: Rect, line: Point[]) => segmentsOf(line).some(s => segmentThroughRect(s, b))

// p から q への輪の範囲が、ほかの箱か線とぶつかるか
function taken(r: Rect, p: Point, q: Point, boxes: Rect[], lines: Point[][]): boolean {
  const box = bounds(arc(r, p, q))
  return boxes.some(o => hits(box, o)) || lines.some(l => crosses(box, l))
}

// 箱 r の自分に戻る線の点の並び（始点から終点へ）と、端が動ける範囲（ends。始点と終点それぞれ、もう一方の端の辺と
// その両隣をたどる道）。boxes はほかの箱（同じページ。紙の座標）、lines はほかの線の点の並び。
// at は端の位置の指定（片方だけでもよい。無い方は角に描くときの位置）
export function selfLoop(
  r: Rect,
  boxes: Rect[],
  index: number,
  lines: Point[][] = [],
  at: { exit: number | null; enter: number | null } = { exit: null, enter: null },
): { points: Point[]; corner: Corner; ends: { exit: Point[]; enter: Point[] } } {
  let corner: Corner = "topRight"
  let [a, b] = cornerEnds(r, corner, index)
  for (const c of CORNERS) {
    const [p, q] = cornerEnds(r, c, index)
    if (taken(r, p, q, boxes, lines)) continue
    ;[corner, a, b] = [c, p, q]
    break
  }
  const ring = perimeter(r)
  if (at.exit != null || at.enter != null) {
    const p = at.exit != null ? pointAt(ring, at.exit) : a
    const q = at.enter != null ? pointAt(ring, at.enter) : b
    const fp = nearestAt(ring, p),
      fq = nearestAt(ring, q)
    if (OPPOSITE[sideAt(r, fp)] !== sideAt(r, fq)) [a, b] = [p, q]
  }
  const fa = nearestAt(ring, a),
    fb = nearestAt(ring, b)
  return { points: arc(r, a, b), corner, ends: { exit: around(r, sideAt(r, fb)), enter: around(r, sideAt(r, fa)) } }
}

// 点 p に一番近い角
export function nearestCorner(r: Rect, p: Point): Corner {
  const right = p.x >= r.x + r.w / 2,
    top = p.y < r.y + r.h / 2
  return top ? (right ? "topRight" : "topLeft") : right ? "bottomRight" : "bottomLeft"
}

// corner の角に輪を描くときの端の位置（箱のふちを一周した割合）。その角がほかの箱や線とぶつかるなら null
export function cornerAt(
  r: Rect,
  boxes: Rect[],
  index: number,
  lines: Point[][],
  corner: Corner,
): { exit: number; enter: number } | null {
  const [p, q] = cornerEnds(r, corner, index)
  if (taken(r, p, q, boxes, lines)) return null
  const ring = perimeter(r)
  return { exit: nearestAt(ring, p), enter: nearestAt(ring, q) }
}
