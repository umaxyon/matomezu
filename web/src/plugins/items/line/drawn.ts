// ページの線を描く形にする純粋な関数: 形の四角から、線ごとの点の並び・見える線（端の形の付け根で止めた点の並び）・端の形・キャプションの札の枠を決める。
// 2 つの形を結ぶ線は道筋の計算（route.ts。ほかの形は、道筋に関わりうるものだけを避ける）、自分に戻る線は形の角の輪（selfloop.ts）。
// 自分に戻る線は、ほかの線を描いたあとに、ほかの形とほかの線を避ける角に描く（同じ形の 2 本目からは、同じ角で輪を大きくする）
import type { ConnectorData, Point } from "../../../plugin-api"
import type { MinimapMark, PortArea } from "../../base"
import { captionBox } from "./caption"
import { type Head, headDraw } from "./heads"
import { BEND_MARGIN, type PlacedLine } from "./placed"
import {
  alignedEnds,
  type EndMemory,
  fewestRoute,
  isAligned,
  perimeterAt,
  type Route,
  type RouteInput,
  type RouteShape,
  route,
  type Segment,
  scopeObstacles,
  vertexAt,
} from "./route"
import { selfLoop } from "./selfloop"
import { keepApart, type Routed, separateEnds, splitVertices } from "./spread"

export interface DrawnLine {
  id: string
  points: Point[] // 線の点の並び（始点から終点。当たりはこの上で取る）
  shown: Point[] // 見える線（端の形の付け根で止める）
  heads: { fill: string; stroke: string } // 端の形（塗る形と線で描く形の path）
  dashed: boolean
  caption: { text: string; box: { x: number; y: number; w: number; h: number } } | null
  shape: RouteShape | null // 折れ線の形（直線・自分に戻る線は null）
  segments: Segment[] // ドラッグで動かせる途中の区間
  ends: { exit: Point[]; enter: Point[] } // 両端をつまんで動かせる道（形のふち。自分に戻る線は、もう一方の端の辺とその両隣）
  memory: EndMemory | null // 自由な端を描いた辺と位置（折れ線だけ。次に描くときに渡すと、その辺に留まる）
}

// 道筋の、描く形のほかの所
type Geometry = Pick<DrawnLine, "points" | "shape" | "segments" | "ends" | "memory">

// 留まった形が一番よい形よりこれだけ以上折れ目が多ければ、留まるのをやめる（手を離したとき。2 だと、相手の端を動かさずに Z 字で結んだ形まで、離した瞬間にまっすぐへ戻ってしまう）
export const LOOSEN_BENDS = 3

// 描き方の指定。memory は線ごとの、自由な端が前に描いた辺と位置（渡した線はその辺に留まる。折れ目 STICKY_BENDS まで）。
// loose の線は、留まった形が一番よい形より LOOSEN_BENDS 以上折れ目が多ければ、留まらずに一番よい形で描く。
// cache は線ごとの道筋の覚え（入力が同じなら計算し直さない。描く側が持ち、同じものを渡し続ける）
export interface DrawOptions {
  memory?: ReadonlyMap<string, EndMemory>
  loose?: ReadonlySet<string>
  cache?: LineCache
}

// 線ごとの道筋の覚え（描く側が持つ）
export type LineCache = Map<string, { key: string; route: Route }>

// p から q へ向かって d だけ進んだ点
function toward(p: Point, q: Point, d: number): Point {
  const len = Math.hypot(q.x - p.x, q.y - p.y)
  if (!len) return p
  return { x: p.x + ((q.x - p.x) / len) * d, y: p.y + ((q.y - p.y) / len) * d }
}

// 点の並びと端の形から、見える線と端の形の path
function painted(points: Point[], start: Head | undefined, end: Head | undefined) {
  const n = points.length
  const shown = points.map(p => ({ ...p }))
  const ds = start && n >= 2 ? headDraw(start, points[1] as Point, points[0] as Point) : null
  const de = end && n >= 2 ? headDraw(end, points[n - 2] as Point, points[n - 1] as Point) : null
  if (ds?.trim) shown[0] = toward(points[0] as Point, points[1] as Point, ds.trim)
  if (de?.trim) shown[n - 1] = toward(points[n - 1] as Point, points[n - 2] as Point, de.trim)
  return {
    shown,
    heads: { fill: (ds?.fill ?? "") + (de?.fill ?? ""), stroke: (ds?.stroke ?? "") + (de?.stroke ?? "") },
  }
}

// 2 つの形を結ぶ線の道筋を決める入力（ほかの形は、道筋に関わりうるものだけ）。rects は形のつながる範囲（辺の真ん中だけにつなぐ形は、端を頂点に限る）。
// 両端の形の四角が無い線と、自分に戻る線は null
export function routeInputOf(l: PlacedLine, rects: ReadonlyMap<string, PortArea>, elbow: boolean): RouteInput | null {
  const a = rects.get(l.from)
  const b = rects.get(l.to)
  if (!a || !b || l.from === l.to) return null
  const input = {
    a,
    b,
    elbow: (l.props.route ?? (elbow ? "elbow" : "straight")) === "elbow",
    via: l.props.via ?? null,
    obstacles: [...rects].filter(([id]) => id !== l.from && id !== l.to).map(([, r]) => r),
    margin: BEND_MARGIN,
    exitAt: l.props.exitAt ?? null,
    enterAt: l.props.enterAt ?? null,
    aVertex: a.midpoints ?? false,
    bVertex: b.midpoints ?? false,
  }
  return { ...input, obstacles: scopeObstacles(input) }
}

// 整列: 線 l の今の形のまま、両端をその辺の一番よい位置（向き合う辺どうしでまっすぐ結べるならその位置、そうでなければ辺の真ん中）に置いた端の位置。
// 今の形は、ページの線 lines（l は今の項目に置き換える）を描いた形。もう整列していて手で直した区間も無ければ null（自分に戻る線・描けない線も null）
export function alignedEndsOf(
  l: PlacedLine,
  rects: ReadonlyMap<string, PortArea>,
  elbow: boolean,
  lines: readonly PlacedLine[] = [l],
): { exitAt: number; enterAt: number } | null {
  const input = routeInputOf(l, rects, elbow)
  const pts = drawLines(
    lines.map(x => (x.id === l.id ? l : x)),
    rects,
    elbow,
  ).find(d => d.id === l.id)?.points
  if (!input || !pts) return null
  return isAligned(input, pts) ? null : alignedEnds(input, pts)
}

// ページの線を描く形にする。rects は形のつながる範囲（紙の座標。portAreasOf）、elbow はページの既定が折れ線か。両端の形の四角が無い線は描かない
export function drawLines(
  lines: readonly PlacedLine[],
  rects: ReadonlyMap<string, PortArea>,
  elbow: boolean,
  options: DrawOptions = {},
): DrawnLine[] {
  const geos = new Map<string, Geometry>()
  const others = (ids: readonly string[]) => [...rects].filter(([id]) => !ids.includes(id)).map(([, r]) => r)
  // 辺の真ん中だけにつなぐ形から出る線の頂点（spread.ts）
  const split = splitVertices(lines, rects)
  const routed: Routed[] = []
  for (const l of lines) {
    const found = routeInputOf(l, rects, elbow)
    if (!found) continue
    const v = split.get(l.id)
    const base = v && found.exitAt == null ? { ...found, exitAt: perimeterAt(found.a, vertexAt(found.a, v)) } : found
    const memory = options.memory?.get(l.id) ?? null
    const loose = options.loose?.has(l.id) ?? false
    const key = JSON.stringify([base, memory, loose])
    const hit = options.cache?.get(l.id)
    if (hit?.key === key) {
      routed.push({ line: l, input: base, route: hit.route })
      continue
    }
    // 留まる辺が無ければ、折れ目の一番少ない形
    let r = memory ? route({ ...base, memory }) : fewestRoute(base)
    if (memory && loose) {
      const best = fewestRoute(base)
      if (r.bends - best.bends >= LOOSEN_BENDS) r = best
    }
    options.cache?.set(l.id, { key, route: r })
    routed.push({ line: l, input: base, route: r })
  }
  // 同じ形の同じ所に入る線を散らす（spread.ts）
  separateEnds(routed)
  // 先の線の端と同じ所にある端を、空いている辺へ回す（spread.ts）
  keepApart(routed)
  for (const { line, route: r } of routed) {
    geos.set(line.id, { points: r.points, shape: r.shape, segments: r.segments, ends: r.ends, memory: r.memory })
  }
  const loops = new Map<string, number>()
  for (const l of lines) {
    const r = rects.get(l.from)
    if (!r || l.from !== l.to) continue
    const index = loops.get(l.from) ?? 0
    loops.set(l.from, index + 1)
    const at = { exit: l.props.exitAt ?? null, enter: l.props.enterAt ?? null }
    // 避けるのは、同じ形の自分に戻る線を除いたほかの線（同じ形の線は、同じ角で輪を大きくして重ねる）
    const drawn = lines
      .filter(o => o.from !== l.from || o.to !== l.from)
      .flatMap(o => {
        const g = geos.get(o.id)
        return g ? [g.points] : []
      })
    const loop = selfLoop(r, others([l.from]), index, drawn, at)
    geos.set(l.id, { points: loop.points, shape: null, segments: [], ends: loop.ends, memory: null })
  }
  return lines.flatMap(l => {
    const geo = geos.get(l.id)
    if (!geo) return []
    const pts = geo.points
    const text = l.props.caption?.trim() ?? ""
    const box = text ? captionBox(pts, { at: l.props.captionAt, offset: l.props.captionOffset }, l.from === l.to) : null
    return [
      {
        id: l.id,
        points: pts,
        ...painted(pts, l.props.startHead, l.props.endHead),
        dashed: l.props.dash === "dashed",
        caption: box && { text, box },
        shape: geo.shape,
        segments: geo.segments,
        ends: geo.ends,
        memory: geo.memory,
      },
    ]
  })
}

// ページの線を描いたときの外枠（線の点の並びとキャプションの札。紙の座標）。描く線が無ければ null。
// 描くときにだけある状態（前に描いた辺など）は使わない。rects は形のつながる範囲、elbow はページの既定が折れ線か。
// 受け取る線は置いた線のデータ（線の定義の bounds から呼ぶので、型は線の定義に頼らない形で受ける）
export function linesBounds(
  lines: readonly ConnectorData[],
  rects: ReadonlyMap<string, PortArea>,
  elbow: boolean,
): { x: number; y: number; w: number; h: number } | null {
  const pts = drawLines(lines as readonly PlacedLine[], rects, elbow).flatMap(d => {
    const c = d.caption?.box
    return c ? [...d.points, { x: c.x, y: c.y }, { x: c.x + c.w, y: c.y + c.h }] : d.points
  })
  if (pts.length === 0) return null
  const x = Math.min(...pts.map(p => p.x))
  const y = Math.min(...pts.map(p => p.y))
  return { x, y, w: Math.max(...pts.map(p => p.x)) - x, h: Math.max(...pts.map(p => p.y)) - y }
}

// ページの線のミニマップの絵: 線ごとの点の並びの折れ線（端の形とキャプションは描かない）。引数は linesBounds と同じ
export function linesMinimap(
  lines: readonly ConnectorData[],
  rects: ReadonlyMap<string, PortArea>,
  elbow: boolean,
): MinimapMark[] {
  return drawLines(lines as readonly PlacedLine[], rects, elbow).map(d => ({ kind: "polyline", points: d.points }))
}
