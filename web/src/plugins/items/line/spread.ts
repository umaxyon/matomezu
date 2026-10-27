// 線の端を散らす決まり（純粋な関数）: 1 つの形の同じ所に、線の端を重ねない。
// - 辺の真ん中だけにつなぐ形（ひし形など）から出る線は、1 つの頂点から 2 本出さない（splitVertices）
// - 同じ形の同じ所に入る線が 2 本以上あれば、1 本だけ残し、ほかは空いている辺へ逃がす（separateEnds）
// - 線の始点か終点が、ほかの線の端（出る端と入る端）と同じ所にあれば、後の線を空いている辺へ回す。始点は反時計回り、終点は時計回りの順に
//   候補を並べ、ほかの線と交わらない・折れ目の少ない組み合わせを選ぶ（keepApart）
// どれも描くときだけ決め、データは書き換えない。端を固定した線は動かさない
import type { Point, PortArea } from "../../../plugin-api"
import { centerOf } from "./geom"
import type { PlacedLine } from "./placed"
import {
  fewestRoute,
  perimeterAt,
  type Route,
  type RouteInput,
  routeOnSides,
  type Side,
  sideAt,
  vertexAt,
} from "./route"

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

// 辺を時計回りに並べた順
const CLOCKWISE: readonly Side[] = ["t", "r", "b", "l"]

// side から回る向き（1 は時計回り、-1 は反時計回り）にたどった、ほかの 3 つの辺
const turning = (side: Side, dir: 1 | -1): Side[] =>
  [1, 2, 3].map(k => CLOCKWISE[(CLOCKWISE.indexOf(side) + dir * k + 4) % 4] as Side)

// 2 つの線分が、端以外の所で交わるか（触れるだけ・重なって続くものは数えない）
function crossing([p1, p2]: [Point, Point], [q1, q2]: [Point, Point]): boolean {
  const turn = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  const d1 = turn(q1, q2, p1),
    d2 = turn(q1, q2, p2),
    d3 = turn(p1, p2, q1),
    d4 = turn(p1, p2, q2)
  return d1 * d2 < 0 && d3 * d4 < 0
}
const pieces = (pts: Point[]): [Point, Point][] => pts.slice(1).map((q, i) => [pts[i] as Point, q])
// 点の並び pts が、ほかの線 others と交わる数
const crossings = (pts: Point[], others: Point[][]): number =>
  others.reduce((n, o) => n + pieces(pts).filter(a => pieces(o).some(b => crossing(a, b))).length, 0)

// 線の始点か終点が、先の線の端（出る端と入る端）と同じ所にあれば、その端を、形のどの線の端もつながっていない辺の真ん中へ回す。
// 候補の辺は、始点は今の辺から反時計回り、終点は時計回りの順に並べ、組み合わせのうち、ほかの線と交わる数が少ない形、
// 同じなら折れ目の少ない形、それも同じなら並べた順の先の形にする（素直につなぐ）。空いている辺が無ければ重ねたまま。
// 入る端どうしの重なりは separateEnds が見るので、出る端が関わる重なりだけ。端を固定した側は動かさない。routed の route を置き換える
export function keepApart(routed: Routed[]): void {
  const ends = (x: Routed) => ({
    exit: x.route.points[0] as Point,
    enter: x.route.points[x.route.points.length - 1] as Point,
  })
  const near = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) < SAME_END
  // 形 box の、線 skip のほかの線の端がつながっている辺
  const usedSides = (box: string, rim: RouteInput["a"], skip: Routed) =>
    new Set(
      routed.flatMap(y => {
        if (y === skip || y.route.arrangement === "overlap") return []
        const e = ends(y)
        return [
          ...(y.line.from === box ? [sideAt(rim, e.exit)] : []),
          ...(y.line.to === box ? [sideAt(rim, e.enter)] : []),
        ]
      }),
    )
  routed.forEach((x, i) => {
    if (x.route.arrangement === "overlap") return
    const before = routed.slice(0, i).filter(y => y.route.arrangement !== "overlap")
    const e = ends(x)
    // この形のこの点に、先の線の端があるか（入る端どうしは除く）
    const clash = (box: string, p: Point, entering: boolean) =>
      before.some(y => {
        const f = ends(y)
        return (y.line.from === box && near(f.exit, p)) || (!entering && y.line.to === box && near(f.enter, p))
      })
    // 回す先の候補（ふち一周の割合）。空いている辺が無ければ null
    const choices = (box: string, rim: RouteInput["a"], p: Point, dir: 1 | -1): number[] | null => {
      const side = sideAt(rim, p)
      if (!side) return null
      const used = usedSides(box, rim, x)
      const free = turning(side, dir).filter(s => !used.has(s))
      return free.length ? free.map(s => perimeterAt(rim, vertexAt(rim, s))) : null
    }
    const { exitAt, enterAt } = x.line.props
    const exits =
      exitAt === undefined && clash(x.line.from, e.exit, false) ? choices(x.line.from, x.input.a, e.exit, -1) : null
    const enters =
      enterAt === undefined && clash(x.line.to, e.enter, true) ? choices(x.line.to, x.input.b, e.enter, 1) : null
    if (exits === null && enters === null) return
    const others = routed.filter(y => y !== x).map(y => y.route.points)
    let best: { route: Route; cross: number } | null = null
    for (const ex of exits ?? [x.input.exitAt ?? null])
      for (const en of enters ?? [x.input.enterAt ?? null]) {
        const route = fewestRoute({ ...x.input, exitAt: ex, enterAt: en })
        const cross = crossings(route.points, others)
        if (!best || cross < best.cross || (cross === best.cross && route.bends < best.route.bends))
          best = { route, cross }
      }
    if (best) x.route = best.route
  })
}
