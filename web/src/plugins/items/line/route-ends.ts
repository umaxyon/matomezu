// 線の端: 箱のふちの上の点の辺と割合、辺の真ん中（ひし形の頂点）、固定の端の位置、両端の整列。画面に依存しない純粋な関数
import type { Point } from "../../../plugin-api"
import { nearestAt, overlapSpan, pointAt, type Rect } from "./geom"
import type { Axis, EndPlace, EndsAt, RouteInput, Side } from "./route"
import { perimeter } from "./selfloop"

export const axisOfSide = (side: Side): Axis => (side === "l" || side === "r" ? "horizontal" : "vertical")

// 箱 r の、点 p に一番近い辺
export function sideOf(r: Rect, p: Point): Side {
  const d = [Math.abs(p.y - r.y), Math.abs(p.x - (r.x + r.w)), Math.abs(p.y - (r.y + r.h)), Math.abs(p.x - r.x)]
  return (["t", "r", "b", "l"] as const)[d.indexOf(Math.min(...d))] as Side
}

// 辺の真ん中（ひし形の頂点）
export function vertexAt(r: Rect, side: Side): Point {
  return side === "t"
    ? { x: r.x + r.w / 2, y: r.y }
    : side === "r"
      ? { x: r.x + r.w, y: r.y + r.h / 2 }
      : side === "b"
        ? { x: r.x + r.w / 2, y: r.y + r.h }
        : { x: r.x, y: r.y + r.h / 2 }
}

// 箱 r の、点 p に一番近い辺の真ん中（ひし形の頂点）
export function vertexOf(r: Rect, p: Point): Point {
  return vertexAt(r, sideOf(r, p))
}

// 箱 r のふちの上の点 p の、辺と辺の上の割合
export function placeOf(r: Rect, p: Point, side = sideOf(r, p)): EndPlace {
  const at = axisOfSide(side) === "horizontal" ? (p.y - r.y) / r.h : (p.x - r.x) / r.w
  return { side, at: Math.min(1, Math.max(0, at)) }
}

// 点のふち一周の割合（exitAt / enterAt に書く値。小数 4 桁）
export function perimeterAt(r: Rect, p: Point): number {
  return Math.round(nearestAt(perimeter(r), p) * 10000) / 10000
}

// 固定の端の点（ひし形なら一番近い頂点）。自由なら null
export function fixedPoint(r: Rect, at: number | null | undefined, vertex: boolean | undefined): Point | null {
  if (at == null) return null
  const p = pointAt(perimeter(r), at)
  return vertex ? vertexOf(r, p) : p
}

// 線の端（点の並びの最初か最後）が出入りしている辺。端の区間が横なら左右、縦なら上下（角にあっても向きで決まる）
export function endSide(r: Rect, pts: Point[], last: boolean): Side {
  const p = last ? (pts[pts.length - 1] as Point) : (pts[0] as Point)
  const q = last ? (pts[pts.length - 2] as Point) : (pts[1] as Point)
  if (!q || (p.x !== q.x && p.y !== q.y)) return sideOf(r, p)
  if (p.y === q.y) return p.x >= r.x + r.w - 0.5 ? "r" : "l"
  return p.y >= r.y + r.h - 0.5 ? "b" : "t"
}

// 固定の端の、内部での位置（辺と辺の上の割合）
export function fixedPlaces(r: RouteInput): { a: EndPlace | null; b: EndPlace | null } {
  const fa = fixedPoint(r.a, r.exitAt, r.aVertex),
    fb = fixedPoint(r.b, r.enterAt, r.bVertex)
  return { a: fa ? placeOf(r.a, fa) : null, b: fb ? placeOf(r.b, fb) : null }
}

// 手で直した via の形を描く・縮めるときの、両端の辺の上の割合（固定の端の位置）
export function fixedAts(r: RouteInput): EndsAt {
  const f = fixedPlaces(r)
  return { exitAt: f.a?.at ?? null, enterAt: f.b?.at ?? null }
}

// 整列: 今の点の並び pts の両端を、その辺のままで一番よい位置に置き直す（ふち一周の割合で返す）。向き合う辺どうしで
// まっすぐ結べるなら重なる範囲の真ん中でまっすぐ、そうでなければ辺の真ん中
export function alignedEnds(r: RouteInput, pts: Point[]): { exitAt: number; enterAt: number } {
  const [p, q] = alignTargets(r, pts)
  return { exitAt: perimeterAt(r.a, p), enterAt: perimeterAt(r.b, q) }
}

// 整列したときの両端の点
function alignTargets(r: RouteInput, pts: Point[]): [Point, Point] {
  const { a, b } = r
  const sa = endSide(a, pts, false),
    sb = endSide(b, pts, true)
  let p = vertexAt(a, sa),
    q = vertexAt(b, sb)
  const facing =
    (sa === "r" && sb === "l" && a.x + a.w <= b.x) ||
    (sa === "l" && sb === "r" && b.x + b.w <= a.x) ||
    (sa === "b" && sb === "t" && a.y + a.h <= b.y) ||
    (sa === "t" && sb === "b" && b.y + b.h <= a.y)
  if (facing && !r.aVertex && !r.bVertex) {
    if (axisOfSide(sa) === "horizontal") {
      const [lo, hi] = overlapSpan(a, b, "y")
      if (hi > lo) {
        p = { x: p.x, y: (lo + hi) / 2 }
        q = { x: q.x, y: (lo + hi) / 2 }
      }
    } else {
      const [lo, hi] = overlapSpan(a, b, "x")
      if (hi > lo) {
        p = { x: (lo + hi) / 2, y: p.y }
        q = { x: (lo + hi) / 2, y: q.y }
      }
    }
  } else if (facing) {
    // ひし形の頂点は動かせないので、もう一方（普通の箱）を頂点にそろえる（重なる範囲にあれば）。
    // 左右の辺どうしなら y を、上下の辺どうしなら x をそろえる
    const k = axisOfSide(sa) === "horizontal" ? "y" : "x"
    const size = k === "y" ? "h" : "w"
    if (r.aVertex && !r.bVertex && p[k] > b[k] && p[k] < b[k] + b[size])
      q = k === "y" ? { x: q.x, y: p.y } : { x: p.x, y: q.y }
    if (r.bVertex && !r.aVertex && q[k] > a[k] && q[k] < a[k] + a[size])
      p = k === "y" ? { x: p.x, y: q.y } : { x: q.x, y: p.y }
  }
  return [p, q]
}

// 整列しても変わらないか（両端がもう整列した位置にあり、手で直した区間も無い）。整列ボタンを押せなくするのに使う
export function isAligned(r: RouteInput, pts: Point[]): boolean {
  if (r.via || pts.length < 2) return false
  const [p, q] = alignTargets(r, pts)
  const near = (u: Point, v: Point) => Math.abs(u.x - v.x) < 0.5 && Math.abs(u.y - v.y) < 0.5
  return near(pts[0] as Point, p) && near(pts[pts.length - 1] as Point, q)
}
