// ページの線を描く形にする純粋な関数: 形の四角から、線ごとの点の並び・見える線（端の形の付け根で止めた点の並び）・端の形・キャプションの札の枠を決める。
// 2 つの形を結ぶ線は道筋の計算（route.ts。ほかの形は、道筋に関わりうるものだけを避ける）、自分に戻る線は形の角の輪（selfloop.ts）。
// 自分に戻る線は、ほかの線を描いたあとに、ほかの形とほかの線を避ける角に描く（同じ形の 2 本目からは、同じ角で輪を大きくする）
import { captionBox } from "./caption"
import type { Pt, Rect } from "./geom"
import { type Head, headDraw } from "./heads"
import { BEND_MARGIN, type PlacedLine } from "./placed"
import { route, scopeObstacles } from "./route"
import { selfLoop } from "./selfloop"

export interface DrawnLine {
  id: string
  points: Pt[] // 線の点の並び（始点から終点。当たりはこの上で取る）
  shown: Pt[] // 見える線（端の形の付け根で止める）
  heads: { fill: string; stroke: string } // 端の形（塗る形と線で描く形の path）
  dashed: boolean
  caption: { text: string; box: { x: number; y: number; w: number; h: number } } | null
}

// p から q へ向かって d だけ進んだ点
function toward(p: Pt, q: Pt, d: number): Pt {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1])
  if (!len) return p
  return [p[0] + ((q[0] - p[0]) / len) * d, p[1] + ((q[1] - p[1]) / len) * d]
}

// 点の並びと端の形から、見える線と端の形の path
function painted(points: Pt[], start: Head | undefined, end: Head | undefined) {
  const n = points.length
  const shown = points.map(p => [...p] as Pt)
  const ds = start && n >= 2 ? headDraw(start, points[1] as Pt, points[0] as Pt) : null
  const de = end && n >= 2 ? headDraw(end, points[n - 2] as Pt, points[n - 1] as Pt) : null
  if (ds?.trim) shown[0] = toward(points[0] as Pt, points[1] as Pt, ds.trim)
  if (de?.trim) shown[n - 1] = toward(points[n - 1] as Pt, points[n - 2] as Pt, de.trim)
  return {
    shown,
    heads: { fill: (ds?.fill ?? "") + (de?.fill ?? ""), stroke: (ds?.stroke ?? "") + (de?.stroke ?? "") },
  }
}

// ページの線を描く形にする。rects は形の四角（紙の座標）、elbow はページの既定が折れ線か。両端の形の四角が無い線は描かない
export function drawLines(lines: readonly PlacedLine[], rects: ReadonlyMap<string, Rect>, elbow: boolean): DrawnLine[] {
  const points = new Map<string, Pt[]>()
  const others = (ids: readonly string[]) => [...rects].filter(([id]) => !ids.includes(id)).map(([, r]) => r)
  for (const l of lines) {
    const a = rects.get(l.from)
    const b = rects.get(l.to)
    if (!a || !b || l.from === l.to) continue
    const input = {
      a,
      b,
      elbow: (l.props.route ?? (elbow ? "elbow" : "straight")) === "elbow",
      via: l.props.via ?? null,
      obstacles: others([l.from, l.to]),
      margin: BEND_MARGIN,
      exitAt: l.props.exitAt ?? null,
      enterAt: l.props.enterAt ?? null,
    }
    points.set(l.id, route({ ...input, obstacles: scopeObstacles(input) }).points)
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
        const pts = points.get(o.id)
        return pts ? [pts] : []
      })
    points.set(l.id, selfLoop(r, others([l.from]), index, drawn, at).points)
  }
  return lines.flatMap(l => {
    const pts = points.get(l.id)
    if (!pts) return []
    const text = l.props.caption?.trim() ?? ""
    const box = text ? captionBox(pts, { at: l.props.captionAt, offset: l.props.captionOffset }, l.from === l.to) : null
    return [
      {
        id: l.id,
        points: pts,
        ...painted(pts, l.props.startHead, l.props.endHead),
        dashed: l.props.dash === "dashed",
        caption: box && { text, box },
      },
    ]
  })
}
