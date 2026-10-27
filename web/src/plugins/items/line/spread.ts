// 線の端を散らす決まり（純粋な関数）: 1 つの形の同じ所に、線の端を重ねない。
// - 辺の真ん中だけにつなぐ形（ひし形など）から出る線は、1 つの頂点から 2 本出さない（splitVertices）
// - 同じ形の同じ所に入る線が 2 本以上あれば、1 本だけ残し、ほかは空いている辺へ逃がす（separateEnds）
// どちらも描くときだけ決め、データは書き換えない。端を固定した線は動かさない
import type { Point, PortArea } from "../../../plugin-api"
import { centerOf } from "./geom"
import type { PlacedLine } from "./placed"
import { type Route, type RouteInput, routeOnSides, type Side, sideAt } from "./route"

const VERTEX_DIR: Record<Side, Point> = { t: { x: 0, y: -1 }, r: { x: 1, y: 0 }, b: { x: 0, y: 1 }, l: { x: -1, y: 0 } }
// 頂点を割り当てる線の数の上限（頂点は 4 つ）
const MAX_SPLIT = 4
// 同じ所とみなす、端どうしの距離（割合を丸めたずれ）
const SAME_END = 6

// 中心から (dx, dy) の向きに一番近い頂点
const facingVertex = ({ x, y }: Point): Side => (Math.abs(x) > Math.abs(y) ? (x > 0 ? "r" : "l") : y > 0 ? "b" : "t")

// 頂点 v の向きと、相手への向き d のなす角
function misfit(v: Side, d: Point): number {
  const u = VERTEX_DIR[v]
  const len = Math.hypot(d.x, d.y) || 1
  return Math.acos(Math.max(-1, Math.min(1, (u.x * d.x + u.y * d.y) / len)))
}

// 線ごとの相手への向き targets に、別々の頂点を割り当てる。avoid の頂点（入ってくる線が使う頂点）は、空いていれば使わない。
// 頂点の向きと相手の向きのなす角の合計が一番小さい割り当て。MAX_SPLIT 本より多ければ割り当てない（null）
export function assignVertices(targets: readonly Point[], avoid: readonly Side[] = []): (Side | null)[] {
  if (targets.length > MAX_SPLIT) return targets.map(() => null)
  const all: Side[] = ["b", "r", "l", "t"]
  const free = all.filter(v => !avoid.includes(v))
  const pool = free.length >= targets.length ? free : all
  let best: Side[] = []
  let bestCost = Infinity
  const pick = (i: number, used: Side[], cost: number) => {
    if (cost >= bestCost - 1e-9) return
    if (i === targets.length) {
      best = used
      bestCost = cost
      return
    }
    for (const v of pool) if (!used.includes(v)) pick(i + 1, [...used, v], cost + misfit(v, targets[i] as Point))
  }
  pick(0, [], 0)
  return best
}

// 辺の真ん中だけにつなぐ形から出る線の頂点（線の id → 頂点）。始点を固定していない線が 2 本以上ある形だけ。
// 入ってくる線の頂点（入ってくる線の相手に向いた頂点）は、空いていれば避ける
export function splitVertices(lines: readonly PlacedLine[], rects: ReadonlyMap<string, PortArea>): Map<string, Side> {
  const out = new Map<string, Side>()
  const center = (id: string) => centerOf(rects.get(id) as PortArea)
  for (const [id, r] of rects) {
    if (!r.midpoints) continue
    const leaving = lines.filter(l => l.from === id && l.to !== id && l.props.exitAt === undefined && rects.has(l.to))
    if (leaving.length < 2) continue
    const c = centerOf(r)
    const toward = (other: string): Point => {
      const o = center(other)
      return { x: o.x - c.x, y: o.y - c.y }
    }
    const avoid = lines
      .filter(l => l.to === id && l.from !== id && rects.has(l.from))
      .map(l => facingVertex(toward(l.from)))
    const vs = assignVertices(
      leaving.map(l => toward(l.to)),
      avoid,
    )
    leaving.forEach((l, i) => {
      const v = vs[i]
      if (v) out.set(l.id, v)
    })
  }
  return out
}

export interface Routed {
  line: PlacedLine
  input: RouteInput
  route: Route
}

// 折れ線の長さ
const lengthOf = (r: Route) =>
  r.points
    .slice(1)
    .reduce((s, q, i) => s + Math.abs(q.x - (r.points[i] as Point).x) + Math.abs(q.y - (r.points[i] as Point).y), 0)

// 同じ形の同じ所に入る線を散らす: 終点を固定していない線のうち、同じ形の同じ辺の、端どうしが SAME_END より近いものを 1 組にし、
// 折れ目の少ない線（同じなら短い線）がその所を取る。ほかの線は、その形のまだ線のつながっていない辺のうち、相手に背を向けていない辺から入る
// 折れ目の一番少ない形にする（routeOnSides）。引けなければそのまま重ねる。routed の route を置き換える
export function separateEnds(routed: Routed[]): void {
  const endOf = (x: Routed) => x.route.points[x.route.points.length - 1] as Point
  const groups: Routed[][] = []
  for (const x of routed) {
    if (x.line.props.enterAt !== undefined || x.route.arrangement === "overlap") continue
    const side = sideAt(x.input.b, endOf(x))
    if (!side) continue
    const g = groups.find(
      g =>
        g[0]?.line.to === x.line.to &&
        sideAt(g[0].input.b, endOf(g[0])) === side &&
        Math.hypot(endOf(g[0]).x - endOf(x).x, endOf(g[0]).y - endOf(x).y) < SAME_END,
    )
    if (g) g.push(x)
    else groups.push([x])
  }
  for (const group of groups) {
    if (group.length < 2) continue
    group.sort((x, y) => x.route.bends - y.route.bends || lengthOf(x.route) - lengthOf(y.route))
    const box = (group[0] as Routed).line.to
    const rim = (group[0] as Routed).input.b
    // この形の、もう線がつながっている辺
    const used = new Set<Side | null>(
      routed.flatMap(({ line, route }) => [
        ...(line.to === box ? [sideAt(rim, route.points[route.points.length - 1] as Point)] : []),
        ...(line.from === box ? [sideAt(rim, route.points[0] as Point)] : []),
      ]),
    )
    for (const x of group.slice(1)) {
      // 相手に背を向けていない辺（相手が右上なら上と右。真上なら上と左右）
      const o = centerOf(x.input.a)
      const c = centerOf(rim)
      const dx = o.x - c.x
      const dy = o.y - c.y
      const facing = (["t", "r", "b", "l"] as Side[]).filter(
        s => (s === "t" ? -dy : s === "b" ? dy : s === "l" ? -dx : dx) >= -0.5 && !used.has(s),
      )
      const better = facing.length ? routeOnSides(x.input, "enter", facing) : null
      if (!better) continue
      x.route = better
      used.add(sideAt(rim, better.points[better.points.length - 1] as Point))
    }
  }
}
