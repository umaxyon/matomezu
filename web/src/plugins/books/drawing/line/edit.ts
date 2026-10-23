// 線をじかに直すドラッグの決まり（純粋な関数）: 途中の区間・端・キャプションの札を動かしたあとの線の項目。
// どれも、描いている線（drawLines の結果）と、ポインタの位置（紙の座標）から決める
import { clampCaptionOffset } from "./caption"
import { type DrawnLine, routeInputOf } from "./drawn"
import { leftNormalAt, nearestAt, type Pt, pointAt, type Rect } from "./geom"
import type { PlacedLine } from "./placed"
import { fixedAts, perimeterAt, simplifyVia } from "./route"
import { perimeter } from "./selfloop"

type Props = PlacedLine["props"]

// 線の端が、ほかの線の端に吸い付く距離（紙の px）
export const SNAP_DISTANCE = 8

// 途中の区間 index を、位置 at（区間の向きの座標。動かせる範囲に収める）へ動かした項目。
// 手で直していない（自動の形の）線は、まず両端を今の位置に固定する（手で直した区間は、両端が固定のときだけ持つため）。動かせない区間なら null
export function viaDragged(
  line: PlacedLine,
  drawn: DrawnLine,
  rects: ReadonlyMap<string, Rect>,
  index: number,
  at: number,
): Props | null {
  const seg = drawn.segments.find(s => s.index === index)
  const a = rects.get(line.from)
  const b = rects.get(line.to)
  if (!drawn.shape || !seg || !a || !b) return null
  const props = { ...line.props }
  if (!props.via) {
    props.exitAt ??= perimeterAt(a, drawn.points[0] as Pt)
    props.enterAt ??= perimeterAt(b, drawn.points[drawn.points.length - 1] as Pt)
  }
  const via = [...(props.via ?? drawn.shape.via)]
  via[index] = Math.round(Math.min(seg.hi, Math.max(seg.lo, at)))
  return { ...props, via }
}

// 区間のドラッグを終えたときの項目: 長さ 0 になった区間の折れ目をまとめる（S 字の真ん中の区間が 0 なら Z 字に戻る）
export function viaSettled(
  line: PlacedLine,
  drawn: DrawnLine,
  rects: ReadonlyMap<string, Rect>,
  elbow: boolean,
): Props {
  const input = routeInputOf(line, rects, elbow)
  if (!line.props.via || !drawn.shape || !input) return line.props
  return { ...line.props, via: simplifyVia(input.a, input.b, { ...drawn.shape, via: line.props.via }, fixedAts(input)) }
}

// 端 end（始点 exit か終点 enter）を、ポインタ p に一番近い、動ける道（形のふち）の上の位置へ動かして固定した項目と、吸い付いた点。
// 同じ形につながるほかの線の端のうち、この端が動ける道の上にあるものに SNAP_DISTANCE まで近づいたら、その点に合わせる（値をそろえるだけで、つながりは覚えない）。
// lines はページの線、drawn はその描いた形（drawLines の結果。同じ順でなくてよい）
export function endDragged(
  line: PlacedLine,
  end: "exit" | "enter",
  lines: readonly PlacedLine[],
  drawn: readonly DrawnLine[],
  rects: ReadonlyMap<string, Rect>,
  p: Pt,
): { props: Props; snap: Pt | null } | null {
  const own = end === "exit" ? line.from : line.to
  const me = drawn.find(d => d.id === line.id)
  const r = rects.get(own)
  if (!me || !r) return null
  const path = end === "exit" ? me.ends.exit : me.ends.enter
  const at = pointAt(path, nearestAt(path, p[0], p[1]))
  const snap = snapTarget(line, own, lines, drawn, path, at)
  const [x, y] = snap ?? at
  // 自分に戻る線の道は形のふちの一部なので、ふち一周の割合に直す（2 つの形を結ぶ線の道はふち一周そのもの）
  const value =
    line.from === line.to
      ? Math.round(nearestAt(perimeter(r), x, y) * 1000) / 1000
      : Math.round(nearestAt(path, x, y) * 10000) / 10000
  return { props: { ...line.props, [end === "exit" ? "exitAt" : "enterAt"]: value }, snap }
}

// 形 own につながるほかの線の端のうち、道 path の上にあって、点 p から SNAP_DISTANCE 以内の一番近いもの
function snapTarget(
  line: PlacedLine,
  own: string,
  lines: readonly PlacedLine[],
  drawn: readonly DrawnLine[],
  path: Pt[],
  p: Pt,
): Pt | null {
  let best: Pt | null = null
  let bestD = SNAP_DISTANCE
  for (const o of lines) {
    const d = o.id === line.id ? undefined : drawn.find(x => x.id === o.id)
    if (!d || d.points.length < 2) continue
    const ends: Pt[] = []
    if (o.from === own) ends.push(d.points[0] as Pt)
    if (o.to === own) ends.push(d.points[d.points.length - 1] as Pt)
    for (const q of ends) {
      const on = pointAt(path, nearestAt(path, q[0], q[1]))
      if (Math.hypot(on[0] - q[0], on[1] - q[1]) > 0.5) continue // この端が動ける道の上に無い
      const dist = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (dist <= bestD) {
        best = q
        bestD = dist
      }
    }
  }
  return best
}

// キャプションの札を、ポインタ p に近い線の上の位置と、線から離す量（±CAPTION_OFFSET_MAX まで）に置いた項目
export function captionDragged(line: PlacedLine, points: Pt[], p: Pt): Props {
  if (points.length < 2) return line.props
  const at = nearestAt(points, p[0], p[1])
  const [bx, by] = pointAt(points, at)
  const [nx, ny] = leftNormalAt(points, at)
  const offset = clampCaptionOffset((p[0] - bx) * nx + (p[1] - by) * ny)
  return { ...line.props, captionAt: Math.round(at * 1000) / 1000, captionOffset: Math.round(offset) }
}
