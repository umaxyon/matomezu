// 線の形の計算の道具（点、矩形、折れ線）。DOM は触らない純粋な関数。
// 線の道筋（route.ts）、自分に戻る線（selfloop.ts）、キャプションの置き方（caption.ts）が使う

import type { Point, Rect } from "../../../core/geom"

export type { Rect }

// 折れ線の区間ごとの長さ
const lengths = (path: Point[]) =>
  path.slice(1).map((p, i) => Math.hypot(p.x - (path[i] as Point).x, p.y - (path[i] as Point).y))

// 折れ線の長さ
export const polylineLength = (path: Point[]) => lengths(path).reduce((s, l) => s + l, 0)

// 折れ線の、長さに対する割合 t（0〜1）の点
export function pointAt(path: Point[], t: number): Point {
  const lens = lengths(path)
  let d = Math.min(1, Math.max(0, t)) * lens.reduce((s, l) => s + l, 0)
  for (let i = 0; i < lens.length; i++) {
    if (d <= (lens[i] as number) || i === lens.length - 1) {
      const k = (lens[i] as number) ? Math.min(1, d / (lens[i] as number)) : 0
      const [p, q] = [path[i] as Point, path[i + 1] as Point]
      return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }
    }
    d -= lens[i] as number
  }
  return path[0] as Point
}

// 点 { x, y } に一番近い、折れ線の上の点の割合（0〜1）
export function nearestAt(path: Point[], { x, y }: Point): number {
  const lens = lengths(path)
  const total = lens.reduce((s, l) => s + l, 0)
  if (!total) return 0
  let best = 0,
    bestD = Infinity,
    before = 0
  lens.forEach((len, i) => {
    const [p, q] = [path[i] as Point, path[i + 1] as Point]
    const k = len ? Math.min(1, Math.max(0, ((x - p.x) * (q.x - p.x) + (y - p.y) * (q.y - p.y)) / (len * len))) : 0
    const px = p.x + (q.x - p.x) * k,
      py = p.y + (q.y - p.y) * k
    const d = Math.hypot(x - px, y - py)
    if (d < bestD) {
      bestD = d
      best = (before + len * k) / total
    }
    before += len
  })
  return best
}

// 折れ線の、長さに対する割合 at の所の、進む向きの左を指す長さ 1 の向き（画面の座標。右向きの線なら上 (0, -1)）
export function leftNormalAt(pts: Point[], at: number): Point {
  const lens = lengths(pts)
  const total = lens.reduce((s, l) => s + l, 0)
  let d = Math.min(1, Math.max(0, at)) * total
  for (let i = 0; i < lens.length; i++) {
    if (d <= (lens[i] as number) || i === lens.length - 1) {
      const [p, q] = [pts[i] as Point, pts[i + 1] as Point],
        l = (lens[i] as number) || 1
      return { x: (q.y - p.y) / l, y: -(q.x - p.x) / l }
    }
    d -= lens[i] as number
  }
  return { x: 0, y: -1 }
}

// 折れ線の区間（隣り合う 2 点）の並び
export const segmentsOf = (pts: Point[]): [Point, Point][] => pts.slice(1).map((p, i) => [pts[i] as Point, p])

// 線分が矩形の内側を通るか（縁から 1 の内側。縁に触れるだけのものは数えない）。斜めの線分も厳密に見る
export function segmentThroughRect([{ x: ex1, y: ey1 }, { x: ex2, y: ey2 }]: [Point, Point], r: Rect) {
  const m = 1
  const x0 = r.x + m,
    y0 = r.y + m,
    x1 = r.x + r.w - m,
    y1 = r.y + r.h - m
  if (x1 <= x0 || y1 <= y0) return false
  // Liang–Barsky で線分を矩形に切り取り、残れば通っている
  const dx = ex2 - ex1,
    dy = ey2 - ey1
  let t0 = 0,
    t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  return clip(-dx, ex1 - x0) && clip(dx, x1 - ex1) && clip(-dy, ey1 - y0) && clip(dy, y1 - ey1) && t0 < t1
}

// 矩形の真ん中
export const centerOf = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

// 2 つの矩形の、x（y）の向きの範囲が重なる所 [lo, hi]（hi <= lo なら重ならない）
export function overlapSpan(a: Rect, b: Rect, k: "x" | "y"): [number, number] {
  const s = k === "x" ? "w" : "h"
  return [Math.max(a[k], b[k]), Math.min(a[k] + a[s], b[k] + b[s])]
}

// 矩形どうしが重なるか（margin だけ離れていないと重なるとみなす）
export const rectsOverlap = (a: Rect, b: Rect, margin = 0) =>
  a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y
