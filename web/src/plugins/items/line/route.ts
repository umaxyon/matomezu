// 線の道筋（点の並び）を決める。画面に依存しない純粋な関数。
// 線の両端は、自由（自動）か固定（箱のふちの上の 1 点。exitAt / enterAt に、ふちを左上から時計回りに一周した割合で持つ）。
// 固定の点からは辺も決まる（下の辺の上の点なら下から出入りする）。出入りの向きをデータに持たない。
// 折れ線の形は、内部では始点の箱から出る向き（exit）、終点の箱に入る向き（enter）、途中の区間の位置の並び（via）で表す:
//   始点の箱から exit の向きに出て、via の順に縦と横の区間を交互に置き、最後に enter の向きで終点の箱に入る。
//   via の 1 つ目は、出た区間と交わる向きの区間の位置（exit が横なら縦の区間の x 座標、2 つ目は横の区間の y 座標、…）。
//   exit と enter が同じ向きなら via は奇数個、違えば偶数個（0 個が L 字）。出る辺（左か右か）は via の位置から決まる。
// 手で直した via は、両端が固定のときだけ持つ（向きは固定の端の辺から決まる）。引けるあいだはそのまま使う

import type { Point } from "../../../core/geom"
import { centerOf, nearestAt, overlapSpan, pointAt, type Rect, segmentThroughRect } from "./geom"
import { perimeter } from "./selfloop"

export type { Rect }

// 線の向き（横か縦）
export type Axis = "horizontal" | "vertical"
// 2 つの箱の並び。横に並ぶ、縦に並ぶ、斜め、重なっている
export type Arrangement = "side" | "stack" | "diagonal" | "overlap"

// 折れ線の形（描いているもの。手で直していなければ自動で決めたもの）
export interface RouteShape {
  exit: Axis
  enter: Axis
  via: number[]
}

// ドラッグで動かせる途中の区間。via の index 番目の値を、axis の座標として lo〜hi の間で動かせる
export interface Segment {
  index: number
  axis: "x" | "y"
  lo: number
  hi: number
}

// 箱の辺。"t" は上、"r" は右、"b" は下、"l" は左
export type Side = "t" | "r" | "b" | "l"

// 線の端が出入りする辺と、その辺の上の割合（左右の辺は上から、上下の辺は左から。0〜1）
export interface EndPlace {
  side: Side
  at: number
}

// 自由な端が前に描いたときの辺と位置（画面の中だけ。データには書かない）。描く側はこれを次の入力に渡し、箱を動かしている間の
// 線のちらつきを抑える（STICKY_BENDS まで、その辺と位置を保つ）。固定の端は null
export interface EndMemory {
  exit: EndPlace | null
  enter: EndPlace | null
}

export interface RouteInput {
  a: Rect // 始点の箱（線がつながる範囲。紙の座標）
  b: Rect // 終点の箱
  elbow: boolean // 折れ線か（直線なら false）
  via: number[] | null // 手で直した途中の区間の位置（null は自動。両端が固定のときだけ使う）
  obstacles: Rect[] // 線が通ってほしくない箱（同じページのほかの箱）
  margin: number // 途中の区間を、両端の箱の辺から最低これだけ離す（BEND_MARGIN）
  exitAt?: number | null // 始点の固定の位置（箱のふちを左上から時計回りに一周した割合。null は自由）
  enterAt?: number | null // 終点の固定の位置
  aVertex?: boolean // 始点の端を、辺の真ん中（ひし形の頂点）に限る。固定の位置は、一番近い頂点として読む
  bVertex?: boolean // 終点の端を、辺の真ん中に限る
  memory?: EndMemory | null // 自由な端が前に描いたときの辺と位置（あれば保つ）
}

// 線の端をつまんで動かせる道（箱のふち一周。割合は exitAt / enterAt と同じ）
export interface EndPaths {
  exit: Point[]
  enter: Point[]
}

// データに書き戻すこと（描画の側ではデータを書き換えない。graph が受け取って直す。箱や線をドラッグしている間は、離すまで待つ）
export interface RouteFix {
  clearVia?: boolean // 手で直した via を消す（もう引けない、端が自由になった）
}

export interface Route {
  points: Point[]
  arrangement: Arrangement
  shape: RouteShape | null // 折れ線の形（直線や、まっすぐ結んだ箱どうしなら null）
  segments: Segment[] // ドラッグで動かせる途中の区間
  ends: EndPaths // 線の端をつまんで動かせる道
  memory: EndMemory | null // 自由な端を描いた辺と位置（折れ線だけ。次に描くときに渡すと保つ）
  bends: number // 折れ目の数
  through: boolean // 描いた線がほかの箱（obstacles）を通るか（避ける道が見つからなかった、直線、手で直した形。配置の戦略が箱を動かし直す手がかり）
  fix: RouteFix
}

// 片方の隙間がもう片方のこれだけより小さければ、L 字ではなく Z 字にする
export const ELBOW_Z_RATIO = 1 / 3
// コの字の外を回る区間を、外側の辺からこれだけ離す（自動のとき）
export const LOOP_DEPTH = 24
// Z 字の中棒の位置を探すときの刻み
const BEND_STEP = 4
// 自由な端が前に描いた辺と位置を保つ形で引くときの、折れ目の数の上限（端を動かすより折れ目を増やす）
export const STICKY_BENDS = 3

const flip = (a: Axis): Axis => (a === "horizontal" ? "vertical" : "horizontal")
const axisOfSide = (side: Side): Axis => (side === "l" || side === "r" ? "horizontal" : "vertical")

// 2 つの箱の並び。横に並ぶ（上下の範囲が重なり、左右に離れている）、縦に並ぶ、斜め、重なっている
export function arrangementOf(a: Rect, b: Rect): Arrangement {
  const [y0, y1] = overlapSpan(a, b, "y"),
    [x0, x1] = overlapSpan(a, b, "x")
  const yOverlap = y1 > y0,
    xOverlap = x1 > x0
  return yOverlap && xOverlap ? "overlap" : yOverlap ? "side" : xOverlap ? "stack" : "diagonal"
}

// 中心 (cx, cy) から (dx, dy) 方向へ伸ばした線が矩形の縁と交わる点
function clipToRect(cx: number, cy: number, w: number, h: number, dx: number, dy: number): Point {
  const tx = dx ? w / 2 / Math.abs(dx) : Infinity
  const ty = dy ? h / 2 / Math.abs(dy) : Infinity
  const t = Math.min(tx, ty, 1)
  return { x: cx + dx * t, y: cy + dy * t }
}

// 箱 r の縁の、中心から点 v へ向かう線が交わる点
const clipToward = (r: Rect, v: Point): Point => {
  const { x: cx, y: cy } = centerOf(r)
  return clipToRect(cx, cy, r.w, r.h, v.x - cx, v.y - cy)
}

// 点の並びのどこかの区間が、矩形の内側を通るか（縁に触れるだけのものは数えない）。
// 縦か横の区間は、区間を囲む矩形との重なりで見る。斜めの区間（直線や、形を作れなかったときの中心どうしの線）は、
// 囲む矩形で見ると角の近くを通るだけで通ると数えてしまうので、線そのもので見る
export function passes(pts: Point[], r: Rect) {
  const x0 = r.x + 1,
    y0 = r.y + 1,
    x1 = r.x + r.w - 1,
    y1 = r.y + r.h - 1
  return pts.slice(1).some((q, i) => {
    const p = pts[i] as Point
    const { x: px, y: py } = p,
      { x: qx, y: qy } = q
    if (px !== qx && py !== qy) return segmentThroughRect([p, q], r)
    return Math.max(px, qx) > x0 && Math.min(px, qx) < x1 && Math.max(py, qy) > y0 && Math.min(py, qy) < y1
  })
}

// 形（exit / enter / via）から点の並びを作る。引けない（出る区間が始点の箱の中へ向かう、入る区間が終点の箱の中から来る、
// 線が両端の箱の中を通る、via の数が向きと合わない）なら null
export function shapePoints(a: Rect, b: Rect, s: RouteShape, at: EndsAt = NO_AT): Point[] | null {
  const { exit, enter, via } = s
  if ((exit === enter) !== (via.length % 2 === 1)) return null
  // 出る辺・入る辺の上の位置（出る向きが横なら y、縦なら x）
  const as = endCoord(a, exit, at.exitAt),
    bs = endCoord(b, enter, at.enterAt)
  // 出る辺: 最初に向かう位置が、始点の箱のどちら側にあるか
  const first = via.length ? (via[0] as number) : bs
  let c: Point
  if (exit === "horizontal") {
    if (first >= a.x + a.w) c = { x: a.x + a.w, y: as }
    else if (first <= a.x) c = { x: a.x, y: as }
    else return null
  } else {
    if (first >= a.y + a.h) c = { x: as, y: a.y + a.h }
    else if (first <= a.y) c = { x: as, y: a.y }
    else return null
  }
  const pts: Point[] = [c]
  let axis = exit // 次に引く区間の向き
  for (const v of via) {
    c = axis === "horizontal" ? { x: v, y: c.y } : { x: c.x, y: v }
    pts.push(c)
    axis = flip(axis)
  }
  // 入る辺: 終点の箱の手前まで来て、enter の向きで入る
  if (enter === "horizontal") {
    c = { x: c.x, y: bs }
    pts.push(c)
    if (c.x <= b.x) pts.push({ x: b.x, y: bs })
    else if (c.x >= b.x + b.w) pts.push({ x: b.x + b.w, y: bs })
    else return null
  } else {
    c = { x: bs, y: c.y }
    pts.push(c)
    if (c.y <= b.y) pts.push({ x: bs, y: b.y })
    else if (c.y >= b.y + b.h) pts.push({ x: bs, y: b.y + b.h })
    else return null
  }
  const out = pts.filter((p, i) => i === 0 || p.x !== (pts[i - 1] as Point).x || p.y !== (pts[i - 1] as Point).y)
  if (out.length < 2 || passes(out, a) || passes(out, b)) return null
  return out
}

// 形の途中の区間のうち、ドラッグで動かせるものと、その範囲。最初の区間は始点の箱の今いる側から、最後の区間は終点の箱の今いる側から
// 外へ出ない（margin 空ける）。途中の区間は自由
export function segmentsOf(a: Rect, b: Rect, s: RouteShape, margin: number): Segment[] {
  const n = s.via.length
  return s.via.map((v, i) => {
    const axis: "x" | "y" = (i % 2 === 0) === (s.exit === "horizontal") ? "x" : "y"
    let lo = -Infinity,
      hi = Infinity
    const keepOut = (r: Rect) => {
      const [start, end] = axis === "x" ? [r.x, r.x + r.w] : [r.y, r.y + r.h]
      if (v >= end) lo = Math.max(lo, end + margin)
      else if (v <= start) hi = Math.min(hi, start - margin)
    }
    if (i === 0) keepOut(a)
    if (i === n - 1) keepOut(b)
    return { index: i, axis, lo, hi }
  })
}

// 長さ 0 になった途中の区間の折れ目をまとめる（S 字の真ん中の区間が 0 なら Z 字に戻る）。区間の向きの数は変わらない
export function simplifyVia(a: Rect, b: Rect, s: RouteShape, at: EndsAt = NO_AT): number[] {
  const via = [...s.via]
  // i 番目の区間は、前の位置から次の位置までのびる。前は 1 つ前の値（無ければ始点の出る位置）、次は 1 つ後の値（無ければ終点の入る位置）
  const startOf = () => endCoord(a, s.exit, at.exitAt)
  const endOf = () => endCoord(b, s.enter, at.enterAt)
  for (let changed = true; changed && via.length > 1; ) {
    changed = false
    for (let i = 0; i < via.length; i++) {
      const prev = i > 0 ? (via[i - 1] as number) : startOf()
      const next = i < via.length - 1 ? (via[i + 1] as number) : endOf()
      if (Math.abs(prev - next) > 0.5) continue
      via.splice(i + 1 < via.length ? i : i - 1, 2)
      changed = true
      break
    }
  }
  return via
}

// ---- 線の端 ----

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
function placeOf(r: Rect, p: Point, side = sideOf(r, p)): EndPlace {
  const at = axisOfSide(side) === "horizontal" ? (p.y - r.y) / r.h : (p.x - r.x) / r.w
  return { side, at: Math.min(1, Math.max(0, at)) }
}

// 点のふち一周の割合（exitAt / enterAt に書く値。小数 4 桁）
export function perimeterAt(r: Rect, p: Point): number {
  return Math.round(nearestAt(perimeter(r), p) * 10000) / 10000
}

// 固定の端の点（ひし形なら一番近い頂点）。自由なら null
function fixedPoint(r: Rect, at: number | null | undefined, vertex: boolean | undefined): Point | null {
  if (at == null) return null
  const p = pointAt(perimeter(r), at)
  return vertex ? vertexOf(r, p) : p
}

// 線の端（点の並びの最初か最後）が出入りしている辺。端の区間が横なら左右、縦なら上下（角にあっても向きで決まる）
function endSide(r: Rect, pts: Point[], last: boolean): Side {
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

// ---- 道筋 ----

// 線の道筋を決める。
// - 重なっている箱どうしは、端どうし（自由なら中心どうしを結ぶ線と縁の交点）をまっすぐ結ぶ
// - 直線は、固定の端はその点、自由な端は相手へ向けた点（横か縦に並ぶならまっすぐ、斜めなら中心どうし）
// - 折れ線は、手で直した via（両端が固定のとき）→ 前に描いた辺と位置（memory。STICKY_BENDS まで）→ 一番よい形、の順
export function route(r: RouteInput): Route {
  const { a, b } = r
  const arrangement = arrangementOf(a, b)
  const fix: RouteFix = {}
  const ends: EndPaths = { exit: perimeter(a), enter: perimeter(b) }
  const fa = fixedPoint(a, r.exitAt, r.aVertex),
    fb = fixedPoint(b, r.enterAt, r.bVertex)
  let out: Route
  if (arrangement === "overlap" || !r.elbow) {
    const points =
      arrangement === "overlap"
        ? [fa ?? clipToward(a, centerOf(b)), fb ?? clipToward(b, centerOf(a))]
        : straightPoints(r, arrangement, fa, fb)
    if (r.via) fix.clearVia = true
    out = { points, arrangement, shape: null, segments: [], ends, memory: null, bends: 0, through: false, fix }
  } else {
    out = elbowRoute(r, arrangement, fix)
  }
  out.through = r.obstacles.some(o => passes(out.points, o))
  return out
}

// 直線の両端
function straightPoints(
  r: RouteInput,
  arr: "side" | "stack" | "diagonal",
  fa: Point | null,
  fb: Point | null,
): Point[] {
  const { a, b } = r
  if (fa && fb) return [fa, fb]
  if (fa) return [fa, toward(b, r.bVertex, fa, arr)]
  if (fb) return [toward(a, r.aVertex, fb, arr), fb]
  let [p, q] =
    arr === "diagonal"
      ? [clipToward(a, centerOf(b)), clipToward(b, centerOf(a))]
      : (alignedPoints(a, b, arr) as [Point, Point])
  if (r.aVertex) p = vertexOf(a, p)
  if (r.bVertex) q = vertexOf(b, q)
  // 片方だけひし形なら、もう一方（普通の箱）の端を頂点へ向ける
  if (r.aVertex && !r.bVertex) q = toward(b, false, p, arr)
  if (r.bVertex && !r.aVertex) p = toward(a, false, q, arr)
  return [p, q]
}

// 自由な端を、相手の端 v へ向けて置く。横（縦）に並び、v が自分の高さ（横の範囲）にあればまっすぐ、そうでなければ中心から v へ向かう線と
// 縁の交点。ひし形なら、その点に一番近い頂点
function toward(r: Rect, vertex: boolean | undefined, v: Point, arr: string): Point {
  let p: Point
  if (arr === "side" && v.y > r.y && v.y < r.y + r.h) p = { x: v.x > r.x ? r.x + r.w : r.x, y: v.y }
  else if (arr === "stack" && v.x > r.x && v.x < r.x + r.w) p = { x: v.x, y: v.y > r.y ? r.y + r.h : r.y }
  else p = clipToward(r, v)
  return vertex ? vertexOf(r, p) : p
}

// 端の条件。side が決まっていればその辺から（null は自由）、at が決まっていれば辺の上のその割合（null は自動）
interface EndSpec {
  side: Side | null
  at: number | null
}

// 線の端が、箱 r のどの辺にあるか（端の点 p が辺の上になければ null）
export function sideAt(r: Rect, p: Point): Side | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  if (near(p.y, r.y)) return "t"
  if (near(p.y, r.y + r.h)) return "b"
  if (near(p.x, r.x)) return "l"
  if (near(p.x, r.x + r.w)) return "r"
  return null
}

function elbowRoute(r: RouteInput, arrangement: Arrangement, fix: RouteFix): Route {
  const { a, b } = r
  const fixed = fixedPlaces(r)
  // ひし形の自由な端は、どの辺でも真ん中（頂点）
  const hard = (f: EndPlace | null, vertex: boolean | undefined): EndSpec =>
    f ?? { side: null, at: vertex ? 0.5 : null }
  const ha = hard(fixed.a, r.aVertex),
    hb = hard(fixed.b, r.bVertex)
  const finish = (out: Route): Route => {
    out.fix = fix
    out.memory = {
      exit: fixed.a ? null : placeOf(a, out.points[0] as Point, endSide(a, out.points, false)),
      enter: fixed.b ? null : placeOf(b, out.points[out.points.length - 1] as Point, endSide(b, out.points, true)),
    }
    return out
  }

  // 手で直した形（両端が固定のときだけ）。引けなくなったら消す
  if (r.via) {
    if (fixed.a && fixed.b) {
      const shape = { exit: axisOfSide(fixed.a.side), enter: axisOfSide(fixed.b.side), via: r.via }
      const pts = shapePoints(a, b, shape, { exitAt: fixed.a.at, enterAt: fixed.b.at })
      if (pts && endSide(a, pts, false) === fixed.a.side && endSide(b, pts, true) === fixed.b.side) {
        return finish(drawn(r, arrangement, shape, pts))
      }
    }
    fix.clearVia = true
  }

  // 自由な端は、前に描いた辺と位置を保つ（折れ目 STICKY_BENDS まで）。だめなら辺だけ保つ。それもだめなら一番よい形
  const m = r.memory
  const soft = (
    h: EndSpec,
    f: EndPlace | null,
    mem: EndPlace | null | undefined,
    vertex: boolean | undefined,
    keepAt: boolean,
  ): EndSpec => (f || !mem ? h : { side: mem.side, at: vertex ? 0.5 : keepAt ? mem.at : null })
  if (m && ((!fixed.a && m.exit) || (!fixed.b && m.enter))) {
    for (const keepAt of [true, false]) {
      const sa = soft(ha, fixed.a, m.exit, r.aVertex, keepAt),
        sb = soft(hb, fixed.b, m.enter, r.bVertex, keepAt)
      const out = fit(r, arrangement, sa, sb, STICKY_BENDS, r.obstacles)
      if (out) return finish(out)
    }
  }
  const out =
    fit(r, arrangement, ha, hb, MAX_BENDS, r.obstacles) ??
    fit(r, arrangement, ha, hb, MAX_BENDS, []) ??
    autoRoute(r, arrangement, ha, hb)
  return finish(out)
}

// 端の条件 sa / sb を満たす形。自動の形が満たせばそれ、だめなら候補から（折れ目 maxBends まで、obstacles を通らない）。無ければ null
function fit(
  r: RouteInput,
  arrangement: Arrangement,
  sa: EndSpec,
  sb: EndSpec,
  maxBends: number,
  obstacles: Rect[],
): Route | null {
  const { a, b } = r
  const ok = (pts: Point[]) =>
    (!sa.side || endSide(a, pts, false) === sa.side) && (!sb.side || endSide(b, pts, true) === sb.side)
  const base = autoRoute({ ...r, obstacles }, arrangement, sa, sb)
  if (ok(base.points) && base.bends <= maxBends && !obstacles.some(o => passes(base.points, o))) return base
  const at = { exitAt: sa.at, enterAt: sb.at }
  const ax = sa.side ? axisOfSide(sa.side) : null,
    bx = sb.side ? axisOfSide(sb.side) : null
  const best = pickCandidate(candidatesWith({ ...r, obstacles }, at, ax, bx, maxBends).filter(c => ok(c.points)))
  return best ? drawn(r, arrangement, best.shape, best.points) : null
}

function drawn(r: RouteInput, arrangement: Arrangement, shape: RouteShape, points: Point[]): Route {
  return {
    points,
    arrangement,
    shape,
    segments: segmentsOf(r.a, r.b, shape, r.margin),
    ends: { exit: perimeter(r.a), enter: perimeter(r.b) },
    memory: null,
    bends: points.length - 2,
    through: false,
    fix: {},
  }
}

// まっすぐな 2 点の線（横か縦に並ぶ箱どうし）
function straightRoute(r: RouteInput, arrangement: Arrangement, points: Point[]): Route {
  return {
    points,
    arrangement,
    shape: null,
    segments: [],
    ends: { exit: perimeter(r.a), enter: perimeter(r.b) },
    memory: null,
    bends: 0,
    through: false,
    fix: {},
  }
}

// 自動の形。端の辺が決まっていればその向き（辺そのものは via の位置で決まるので、呼ぶ側で確かめる）、位置が決まっていればその位置
function autoRoute(r: RouteInput, arrangement: Arrangement, sa: EndSpec, sb: EndSpec): Route {
  const { a, b } = r
  const exit = sa.side ? axisOfSide(sa.side) : null,
    enter = sb.side ? axisOfSide(sb.side) : null
  let at: EndsAt = { exitAt: sa.at, enterAt: sb.at }
  // 自動の形がほかの箱を通るなら、通らない形を折れ目の少ない方から探す。見つからなければ自動の形のまま
  const avoided = (pts: Point[]): Route | null => {
    if (!r.obstacles.some(o => passes(pts, o))) return null
    const best = pickCandidate(candidatesWith(r, at, exit, enter, MAX_BENDS, true))
    return best ? drawn(r, arrangement, best.shape, best.points) : null
  }

  if (arrangement === "side" || arrangement === "stack") {
    const across: Axis = arrangement === "side" ? "vertical" : "horizontal" // 並びと交わる向き。これで出入りすると外を回るコの字
    const along = flip(across)
    if (exit === across || enter === across) {
      // 片方の端が並びと交わる向きで、もう片方が違う向きか自由なら、折れ目の少ない形（L 字）を先に探す（ひし形の左右の頂点から、
      // 下の箱の上へ入るなど）。両端とも交わる向きなら、外を回るコの字
      if (exit !== enter) {
        const best = pickCandidate(candidatesWith(r, at, exit, enter, MAX_BENDS, true))
        if (best) return drawn(r, arrangement, best.shape, best.points)
      }
      const shape = loopShape(a, b, arrangement)
      const pts = shapePoints(a, b, shape, at) ?? alignedPoints(a, b, arrangement)
      return avoided(pts) ?? drawn(r, arrangement, shape, pts)
    }
    // 自由な位置の端は、相手の端の位置（固定か、ひし形の頂点）とまっすぐ結べるならそこへ合わせる
    if (at.exitAt == null && at.enterAt != null) at = { ...at, exitAt: alignAt(a, b, along, at.enterAt) }
    if (at.enterAt == null && at.exitAt != null) at = { ...at, enterAt: alignAt(b, a, along, at.exitAt) }
    // 両端の位置が 0.5px 未満しか違わなければ（割合を丸めたずれ）、そろえてまっすぐにする
    if (
      at.exitAt != null &&
      at.enterAt != null &&
      Math.abs(endCoord(a, along, at.exitAt) - endCoord(b, along, at.enterAt)) < 0.5
    ) {
      at = { ...at, enterAt: alignAt(b, a, along, at.exitAt) ?? at.enterAt }
    }
    if (at.exitAt != null || at.enterAt != null) {
      // 位置が決まっていれば、向き合う辺の間の真ん中で折る Z 字（両端の位置がそろえば、まっすぐ）
      const shape: RouteShape = { exit: along, enter: along, via: [zMiddle(a, b, along)] }
      const pts = shapePoints(a, b, shape, at)
      if (pts) {
        const line = collapse(pts)
        if (line.length === 2) return avoided(line) ?? straightRoute(r, arrangement, line)
        return avoided(pts) ?? drawn(r, arrangement, shape, pts)
      }
    }
    const pts = alignedPoints(a, b, arrangement)
    return avoided(pts) ?? straightRoute(r, arrangement, pts)
  }

  const shape = elbowShape(a, b, exit, enter, r.obstacles, r.margin, at)
  const pts = shapePoints(a, b, shape, at) ?? [centerOf(a), centerOf(b)]
  return avoided(pts) ?? drawn(r, arrangement, shape, pts)
}

// 箱 r の、相手 o の端（o の辺の上の割合 oAt）とまっすぐ結べる位置（r の辺の上の割合）。結べなければ null
function alignAt(r: Rect, o: Rect, along: Axis, oAt: number): number | null {
  if (along === "horizontal") {
    const y = o.y + o.h * oAt
    return y > r.y && y < r.y + r.h ? (y - r.y) / r.h : null
  }
  const x = o.x + o.w * oAt
  return x > r.x && x < r.x + r.w ? (x - r.x) / r.w : null
}

// まっすぐ続く途中の点を除く
function collapse(pts: Point[]): Point[] {
  const out: Point[] = [pts[0] as Point]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as Point
    if (out.length >= 2 && straightJoint(out[out.length - 2] as Point, out[out.length - 1] as Point, p))
      out[out.length - 1] = p
    else out.push(p)
  }
  return out
}

// 横（縦）に並ぶ箱どうしをまっすぐ結ぶ。重なる範囲の真ん中で水平（垂直）に
function alignedPoints(a: Rect, b: Rect, arr: "side" | "stack"): Point[] {
  if (arr === "side") {
    const [lo, hi] = overlapSpan(a, b, "y"),
      y = (lo + hi) / 2
    return a.x < b.x
      ? [
          { x: a.x + a.w, y },
          { x: b.x, y },
        ]
      : [
          { x: a.x, y },
          { x: b.x + b.w, y },
        ]
  }
  const [lo, hi] = overlapSpan(a, b, "x"),
    x = (lo + hi) / 2
  return a.y < b.y
    ? [
        { x, y: a.y + a.h },
        { x, y: b.y },
      ]
    : [
        { x, y: a.y },
        { x, y: b.y + b.h },
      ]
}

// 横に並ぶ箱どうしを上下の辺から（縦に並ぶなら左右の辺から）結ぶコの字。両方の箱の同じ側から出て外を回る。
// 回る道の短い方の側（同じなら下か右）。深さは LOOP_DEPTH
function loopShape(a: Rect, b: Rect, arr: "side" | "stack"): RouteShape {
  if (arr === "side") {
    const low = Math.max(a.y + a.h, b.y + b.h) + LOOP_DEPTH,
      high = Math.min(a.y, b.y) - LOOP_DEPTH
    const below = low - (a.y + a.h) + (low - (b.y + b.h)) <= a.y - high + (b.y - high)
    return { exit: "vertical", enter: "vertical", via: [below ? low : high] }
  }
  const rx = Math.max(a.x + a.w, b.x + b.w) + LOOP_DEPTH,
    lx = Math.min(a.x, b.x) - LOOP_DEPTH
  const right = rx - (a.x + a.w) + (rx - (b.x + b.w)) <= a.x - lx + (b.x - lx)
  return { exit: "horizontal", enter: "horizontal", via: [right ? rx : lx] }
}

// 斜めに離れた箱どうしの折れ線の形。始点・終点の向き（exit / enter）で決める:
// - 左右・左右: 横・縦・横の Z 字、上下・上下: 縦・横・縦の Z 字
// - 左右・上下: 横に出て縦に入る L 字、上下・左右: 縦に出て横に入る L 字
// - 自動のある端は、もう一方に合う形から、箱と箱の間の隙間（横 gx、縦 gy）で選ぶ: 片方の隙間がもう片方の 1/3
//   （ELBOW_Z_RATIO）より小さければ Z 字、それ以外は L 字（両方自動なら、隙間の大きい向きに先に出る）
// Z 字の中棒は、真ん中か、ほかの箱を避けた位置
function elbowShape(
  a: Rect,
  b: Rect,
  exit: Axis | null,
  enter: Axis | null,
  obstacles: Rect[],
  margin: number,
  at: EndsAt,
): RouteShape {
  const { x: acx, y: acy } = centerOf(a),
    { x: bcx, y: bcy } = centerOf(b)
  // 向き合う辺（a の出る辺と b の入る辺）の位置
  const ax = bcx > acx ? a.x + a.w : a.x,
    bx = bcx > acx ? b.x : b.x + b.w
  const ay = bcy > acy ? a.y + a.h : a.y,
    by = bcy > acy ? b.y : b.y + b.h
  const gx = Math.abs(bx - ax),
    gy = Math.abs(by - ay)
  const z = (axis: Axis): RouteShape => {
    const [from, to] = axis === "horizontal" ? [ax, bx] : [ay, by]
    const make = (m: number): RouteShape => ({ exit: axis, enter: axis, via: [m] })
    return make(bendAt(from, to, m => shapePoints(a, b, make(m), at), obstacles, margin))
  }
  const l = (first: Axis): RouteShape => ({ exit: first, enter: flip(first), via: [] })
  const nearlySide = gy < gx * ELBOW_Z_RATIO,
    nearlyStack = gx < gy * ELBOW_Z_RATIO
  if (exit && enter) return exit === enter ? z(exit) : l(exit)
  if (exit === "horizontal") return nearlySide ? z("horizontal") : l("horizontal")
  if (exit === "vertical") return nearlyStack ? z("vertical") : l("vertical")
  if (enter === "horizontal") return nearlySide ? z("horizontal") : l("vertical")
  if (enter === "vertical") return nearlyStack ? z("vertical") : l("horizontal")
  if (nearlySide) return z("horizontal")
  if (nearlyStack) return z("vertical")
  return l(gx >= gy ? "horizontal" : "vertical")
}

// Z 字の中棒を置く位置（向き合う 2 辺 from〜to の間）。
// 無ければ真ん中。真ん中だと線がほかの箱を通るなら、真ん中から外へ BEND_STEP ずつ試し、通らない一番近い位置。どこも通るなら真ん中
function bendAt(
  from: number,
  to: number,
  points: (m: number) => Point[] | null,
  obstacles: Rect[],
  margin: number,
): number {
  const lo = Math.min(from, to) + margin,
    hi = Math.max(from, to) - margin
  const mid = (from + to) / 2
  if (hi < lo) return mid
  const clear = (m: number) => {
    const pts = points(m)
    return !!pts && !obstacles.some(o => passes(pts, o))
  }
  for (let d = 0; mid - d >= lo || mid + d <= hi; d += BEND_STEP) {
    if (mid + d <= hi && clear(mid + d)) return mid + d
    if (d && mid - d >= lo && clear(mid - d)) return mid - d
  }
  return mid
}

// ---- 折れ線の端の位置 ----

export interface EndsAt {
  exitAt: number | null
  enterAt: number | null
}
const NO_AT: EndsAt = { exitAt: null, enterAt: null }

// 箱 r から axis の向きに出入りするときの、辺の上の位置（横なら y、縦なら x）。at があれば辺の上の割合、無ければ真ん中
function endCoord(r: Rect, axis: Axis, at: number | null): number {
  return axis === "horizontal" ? r.y + r.h * (at ?? 0.5) : r.x + r.w * (at ?? 0.5)
}

// 横（縦）に並ぶ箱どうしの、向き合う辺の間の真ん中
function zMiddle(a: Rect, b: Rect, along: Axis): number {
  if (along === "horizontal") return a.x < b.x ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2
  return a.y < b.y ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2
}

// ---- ほかの箱を避ける ----
// 線の側の決まり: 自動の形（route）がほかの箱を通るときだけ、通らない形を探して使う（pickCandidate）。
// 配置の戦略が使えるよう、候補の列挙（routeCandidates）は、箱の矩形だけで動く純粋な関数にしてある。戦略は、候補の
// 尺度（折れ目の数、長さ、ほかの箱との余白）で別の候補を選び、両端の位置と via として書き込めば、手で直した形と同じく保たれる

// 折れ線の候補。bends は折れ目の数、length は長さ、clearance はほかの箱との一番近い距離（ほかの箱が無ければ Infinity）
export interface Candidate {
  shape: RouteShape
  points: Point[]
  bends: number
  length: number
  clearance: number
}

// 探す折れ目の数の上限（L 字 1、Z 字・コの字 2、3、S 字 4）
export const MAX_BENDS = 4

// ほかの箱を通らない折れ線の候補を、全部挙げる（順番は決まっているが、選ぶのは呼ぶ側。route は pickCandidate）。
// 固定の端があれば、その辺と位置から出入りする形だけ
export function routeCandidates(r: RouteInput, maxBends = MAX_BENDS): Candidate[] {
  const f = fixedPlaces(r)
  return candidatesWith(
    r,
    fixedAts(r),
    f.a ? axisOfSide(f.a.side) : null,
    f.b ? axisOfSide(f.b.side) : null,
    maxBends,
  ).filter(
    c => (!f.a || endSide(r.a, c.points, false) === f.a.side) && (!f.b || endSide(r.b, c.points, true) === f.b.side),
  )
}

// 線の側の選び方: 折れ目の少ない方、同じなら短い方、それも同じならほかの箱から離れた方（同じなら先に挙げた方）
export function pickCandidate(list: Candidate[]): Candidate | null {
  let best: Candidate | null = null
  for (const c of list) {
    if (!best || c.bends < best.bends) {
      best = c
      continue
    }
    if (c.bends > best.bends) continue
    if (c.length < best.length - 0.5 || (Math.abs(c.length - best.length) <= 0.5 && c.clearance > best.clearance))
      best = c
  }
  return best
}

// 両端の箱を囲む矩形（外へ margin 広げる）に掛かるほかの箱
function nearObstacles(r: RouteInput): Rect[] {
  const { a, b, margin, obstacles } = r
  const lo = { x: Math.min(a.x, b.x) - margin, y: Math.min(a.y, b.y) - margin }
  const hi = { x: Math.max(a.x + a.w, b.x + b.w) + margin, y: Math.max(a.y + a.h, b.y + b.h) + margin }
  return obstacles.filter(o => o.x < hi.x && o.x + o.w > lo.x && o.y < hi.y && o.y + o.h > lo.y)
}

// fewest が true なら、候補が見つかった折れ目の数で探すのをやめる（route が使う。折れ目の多い形まで全部試すと重いため）
// 道筋に関わりうるほかの箱だけを残す。候補の道はどれも、両端の箱の外 LOOP_DEPTH と、行く手の箱の脇 margin までの範囲に収まるので、
// その範囲に掛からない箱は結果を変えない。描画は、これで絞った入力を覚えておく鍵にする（ドラッグ中に遠くの箱が動いても探し直さない）
export function scopeObstacles(r: RouteInput): Rect[] {
  const { a, b, margin, obstacles } = r
  const near = nearObstacles(r)
  const d = Math.max(LOOP_DEPTH, margin)
  const x0 = Math.min(a.x - d, b.x - d, ...near.map(o => o.x - margin)),
    x1 = Math.max(a.x + a.w + d, b.x + b.w + d, ...near.map(o => o.x + o.w + margin))
  const y0 = Math.min(a.y - d, b.y - d, ...near.map(o => o.y - margin)),
    y1 = Math.max(a.y + a.h + d, b.y + b.h + d, ...near.map(o => o.y + o.h + margin))
  return obstacles.filter(o => o.x < x1 && o.x + o.w > x0 && o.y < y1 && o.y + o.h > y0)
}

function candidatesWith(
  r: RouteInput,
  at: EndsAt,
  fixedExit: Axis | null,
  fixedEnter: Axis | null,
  maxBends = MAX_BENDS,
  fewest = false,
): Candidate[] {
  const { a, b, margin, obstacles } = r
  // 途中の区間を置いてみる位置: 両端の箱の間の真ん中、両端の箱の外（LOOP_DEPTH）、行く手にあるほかの箱の脇（margin）
  const near = nearObstacles(r)
  const coords = (k: "x" | "y"): number[] => {
    const size = k === "x" ? "w" : "h"
    const [p, q] = a[k] < b[k] ? [a, b] : [b, a]
    const set = [
      a[k] - LOOP_DEPTH,
      a[k] + a[size] + LOOP_DEPTH,
      b[k] - LOOP_DEPTH,
      b[k] + b[size] + LOOP_DEPTH,
      ...near.flatMap(o => [o[k] - margin, o[k] + o[size] + margin]),
    ]
    if (q[k] > p[k] + p[size]) set.push((p[k] + p[size] + q[k]) / 2)
    return [...new Set(set.map(v => Math.round(v)))]
  }
  const xs = coords("x"),
    ys = coords("y")
  const out: Candidate[] = []
  const axes: Axis[] = ["horizontal", "vertical"]
  for (let k = 0; k + 1 <= maxBends; k++) {
    if (fewest && out.length) break
    for (const exit of axes) {
      if (fixedExit && fixedExit !== exit) continue
      for (const enter of axes) {
        if (fixedEnter && fixedEnter !== enter) continue
        if ((exit === enter) !== (k % 2 === 1)) continue
        const sets = Array.from({ length: k }, (_, i) => ((i % 2 === 0) === (exit === "horizontal") ? xs : ys))
        for (const via of product(sets)) {
          const shape = { exit, enter, via }
          const pts = shapePoints(a, b, shape, at)
          if (
            !pts ||
            pts.length - 2 !== k + 1 ||
            pts.some((p, i) => i >= 2 && straightJoint(pts[i - 2] as Point, pts[i - 1] as Point, p))
          ) {
            continue // 折れ目が重なるか、折れずにまっすぐ続く所がある（もっと折れ目の少ない形と同じ）
          }
          if (!roomy(pts, margin) || obstacles.some(o => passes(pts, o))) continue
          out.push({ shape, points: pts, bends: k + 1, length: lengthOf(pts), clearance: clearanceOf(pts, obstacles) })
        }
      }
    }
  }
  return out
}

// p → q → r が折れずにまっすぐ続くか
function straightJoint(p: Point, q: Point, r: Point): boolean {
  return (p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)
}

// 並びの組み合わせを全部（[[1, 2], [3]] なら [1, 3], [2, 3]）
function product(sets: number[][]): number[][] {
  return sets.reduce<number[][]>((acc, set) => acc.flatMap(p => set.map(v => [...p, v])), [[]])
}

// 最初と最後の区間（箱から出る・入る区間）が margin 以上あるか（矢印が箱の角に詰まらないように）
function roomy(pts: Point[], margin: number): boolean {
  const len = (p: Point, q: Point) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
  return (
    len(pts[0] as Point, pts[1] as Point) >= margin &&
    len(pts[pts.length - 2] as Point, pts[pts.length - 1] as Point) >= margin
  )
}

function lengthOf(pts: Point[]): number {
  return pts
    .slice(1)
    .reduce((s, q, i) => s + Math.abs(q.x - (pts[i] as Point).x) + Math.abs(q.y - (pts[i] as Point).y), 0)
}

// 線とほかの箱の一番近い距離
function clearanceOf(pts: Point[], obstacles: Rect[]): number {
  let best = Infinity
  for (const o of obstacles) {
    for (let i = 1; i < pts.length; i++) {
      const [p, q] = [pts[i - 1] as Point, pts[i] as Point]
      const dx = Math.max(o.x - Math.max(p.x, q.x), 0, Math.min(p.x, q.x) - (o.x + o.w))
      const dy = Math.max(o.y - Math.max(p.y, q.y), 0, Math.min(p.y, q.y) - (o.y + o.h))
      best = Math.min(best, Math.hypot(dx, dy))
    }
  }
  return best
}
