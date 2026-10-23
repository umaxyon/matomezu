// 形の〇から線を引くときの決まり（純粋な関数）: 引ける相手、〇の位置、引いた線の端の位置。
// 〇は形の四辺の真ん中（の少し外）。引いた線の始点は〇の辺の真ん中、終点は離した所に一番近いふちの点に固定し、終点に矢印を付ける。
// 同じ形で離せば自分に戻る線で、離した所に一番近い角が、自動で選ぶ角と違い、空いていれば、端をその角に固定する（同じなら自動のまま）
import type { Registry } from "../../../../core/registry"
import { type DrawingPage, linesOf, shapesOf } from "../placed"
import { drawLines } from "./drawn"
import { nearestAt, type Pt, pointAt, type Rect } from "./geom"
import type { Head } from "./heads"
import { canConnect } from "./placed"
import { perimeterAt, type Side, vertexAt } from "./route"
import { cornerAt, nearestCorner, perimeter, selfLoop } from "./selfloop"

export const SIDES: readonly Side[] = ["t", "r", "b", "l"]
export const PORT_OUT = 10 // 〇の中心を、辺の真ん中からこれだけ外に置く（画面の px）
const OUTWARD: Record<Side, Pt> = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] }

// ページの、線をつなげる形（connectable）か
export function connectable(reg: Registry, page: DrawingPage, id: string): boolean {
  const shape = shapesOf(page).find(s => s.id === id)
  return !!shape && (reg.items.get(shape.item)?.capabilities.includes("connectable") ?? false)
}

// 形 from から線を引ける相手（from 自身は自分に戻る線として入る）。from がつなげる形でなければ無い
export function targetsFrom(reg: Registry, page: DrawingPage, from: string): Set<string> {
  if (!connectable(reg, page, from)) return new Set()
  const lines = linesOf(page)
  return new Set(
    shapesOf(page)
      .map(s => s.id)
      .filter(id => connectable(reg, page, id) && canConnect(lines, from, id)),
  )
}

// 形 r の side の辺の〇の中心（辺の真ん中から out だけ外）
export function portAt(r: Rect, side: Side, out: number): Pt {
  const [x, y] = vertexAt(r, side)
  const [dx, dy] = OUTWARD[side]
  return [x + dx * out, y + dy * out]
}

// 〇から引いた線の項目: 始点は from の side の辺の真ん中、終点は to の、離した所 drop に一番近いふちの点（どちらもふち一周の割合）。終点に矢印。
// 自分に戻る線は、drop に一番近い角が自動の角と違い、空いていればその角の端の位置（同じ角・ふさがっていれば端は自由）。
// rects は形の四角、elbow はページの既定が折れ線か
export function drawnLineProps(
  page: DrawingPage,
  rects: ReadonlyMap<string, Rect>,
  elbow: boolean,
  from: string,
  side: Side,
  to: string,
  drop: Pt,
): { exitAt?: number; enterAt?: number; endHead: Head } | null {
  const a = rects.get(from)
  const b = rects.get(to)
  if (!a || !b) return null
  if (from !== to) {
    const ring = perimeter(b)
    const near = pointAt(ring, nearestAt(ring, drop[0], drop[1]))
    return { exitAt: perimeterAt(a, vertexAt(a, side)), enterAt: perimeterAt(b, near), endHead: "arrow" }
  }
  // 自分に戻る線の角は、線を描くとき（drawLines）と同じ入力で選ぶ: ほかの形と、同じ形の自分に戻る線を除いたほかの線
  const lines = linesOf(page)
  const index = lines.filter(l => l.from === from && l.to === from).length
  const others = [...rects].filter(([id]) => id !== from).map(([, r]) => r)
  const avoid = new Set(lines.filter(l => !(l.from === from && l.to === from)).map(l => l.id))
  const points = drawLines(lines, rects, elbow)
    .filter(l => avoid.has(l.id))
    .map(l => l.points)
  const corner = nearestCorner(a, drop)
  if (selfLoop(a, others, index, points).corner === corner) return { endHead: "arrow" }
  const ends = cornerAt(a, others, index, points, corner)
  if (!ends) return { endHead: "arrow" }
  const round = (v: number) => Math.round(v * 1000) / 1000
  return { exitAt: round(ends.exit), enterAt: round(ends.enter), endHead: "arrow" }
}
