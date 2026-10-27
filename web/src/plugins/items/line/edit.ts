// 線をじかに直す決まり（純粋な関数）: 途中の区間・端・キャプションの札を動かしたあとの線の項目と、線の編集のダイアログで選んだものから変える項目。
// どれも、描いている線（drawLines の結果）と、ポインタの位置（紙の座標）から決める
import type { Point } from "../../../plugin-api"
import type { PortArea } from "../../base"
import { clampCaptionOffset } from "./caption"
import { alignedEndsOf, type DrawnLine, routeInputOf } from "./drawn"
import { leftNormalAt, nearestAt, pointAt, type Rect } from "./geom"
import type { Head } from "./heads"
import type { LineRoute } from "./line"
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
    props.exitAt ??= perimeterAt(a, drawn.points[0] as Point)
    props.enterAt ??= perimeterAt(b, drawn.points[drawn.points.length - 1] as Point)
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
  p: Point,
): { props: Props; snap: Point | null } | null {
  const own = end === "exit" ? line.from : line.to
  const me = drawn.find(d => d.id === line.id)
  const r = rects.get(own)
  if (!me || !r) return null
  const path = end === "exit" ? me.ends.exit : me.ends.enter
  const at = pointAt(path, nearestAt(path, p))
  const snap = snapTarget(line, own, lines, drawn, path, at)
  const q = snap ?? at
  // 自分に戻る線の道は形のふちの一部なので、ふち一周の割合に直す（2 つの形を結ぶ線の道はふち一周そのもの）
  const value =
    line.from === line.to
      ? Math.round(nearestAt(perimeter(r), q) * 1000) / 1000
      : Math.round(nearestAt(path, q) * 10000) / 10000
  return { props: { ...line.props, [end === "exit" ? "exitAt" : "enterAt"]: value }, snap }
}

// 形 own につながるほかの線の端のうち、道 path の上にあって、点 p から SNAP_DISTANCE 以内の一番近いもの
function snapTarget(
  line: PlacedLine,
  own: string,
  lines: readonly PlacedLine[],
  drawn: readonly DrawnLine[],
  path: Point[],
  p: Point,
): Point | null {
  let best: Point | null = null
  let bestD = SNAP_DISTANCE
  for (const o of lines) {
    const d = o.id === line.id ? undefined : drawn.find(x => x.id === o.id)
    if (!d || d.points.length < 2) continue
    const ends: Point[] = []
    if (o.from === own) ends.push(d.points[0] as Point)
    if (o.to === own) ends.push(d.points[d.points.length - 1] as Point)
    for (const q of ends) {
      const on = pointAt(path, nearestAt(path, q))
      if (Math.hypot(on.x - q.x, on.y - q.y) > 0.5) continue // この端が動ける道の上に無い
      const dist = Math.hypot(q.x - p.x, q.y - p.y)
      if (dist <= bestD) {
        best = q
        bestD = dist
      }
    }
  }
  return best
}

// キャプションの札を、ポインタ p に近い線の上の位置と、線から離す量（±CAPTION_OFFSET_MAX まで）に置いた項目
export function captionDragged(line: PlacedLine, points: Point[], p: Point): Props {
  if (points.length < 2) return line.props
  const at = nearestAt(points, p)
  const { x: bx, y: by } = pointAt(points, at)
  const { x: nx, y: ny } = leftNormalAt(points, at)
  const offset = clampCaptionOffset((p.x - bx) * nx + (p.y - by) * ny)
  return { ...line.props, captionAt: Math.round(at * 1000) / 1000, captionOffset: Math.round(offset) }
}

// 線の編集のダイアログで選んだもの。route は選んだ通り方（ページの既定に従う線は、その既定）、once は押した一回きりの操作
export interface LineChoice {
  caption: string
  route: LineRoute
  dash: "solid" | "dashed"
  startHead: Head | ""
  endHead: Head | ""
  once: ReadonlySet<LineOnce>
}
// 一回きりの操作: 整列・接辺の自動選択（端の固定をやめる）・折れ線を自動に戻す・キャプションの位置を自動に戻す
export type LineOnce = "align" | "free" | "via" | "caption"

// 線の編集のダイアログで選んだものを、line-update に渡す項目にする（変えた項目だけ。null は消す）。
// 自分に戻る線の通り方は変えない。接辺の自動選択は両端と区間を消し、整列はほかの項目を変えたあとの形で両端の位置を決めて区間を消す。
// rects は形のつながる範囲、elbow はページの線の既定が折れ線か、lines はページの線（整列は、ほかの線と描いた形で決める）
export function linePatch(
  line: PlacedLine,
  choice: LineChoice,
  rects: ReadonlyMap<string, PortArea>,
  elbow: boolean,
  lines: readonly PlacedLine[] = [line],
): Record<string, unknown> {
  const p = line.props
  const patch: Record<string, unknown> = {}
  const startRoute = p.route ?? (elbow ? "elbow" : "straight")
  if (choice.caption.trim() !== (p.caption?.trim() ?? "")) patch.caption = choice.caption.trim() ? choice.caption : null
  if (line.from !== line.to && choice.route !== startRoute) patch.route = choice.route
  if (choice.dash !== (p.dash ?? "solid")) patch.dash = choice.dash === "dashed" ? "dashed" : null
  if (choice.startHead !== (p.startHead ?? "")) patch.startHead = choice.startHead || null
  if (choice.endHead !== (p.endHead ?? "")) patch.endHead = choice.endHead || null
  if (choice.once.has("free")) Object.assign(patch, { exitAt: null, enterAt: null, via: null })
  if (choice.once.has("via")) patch.via = null
  if (choice.once.has("caption")) Object.assign(patch, { captionAt: null, captionOffset: null })
  if (choice.once.has("align")) {
    const props = Object.fromEntries(Object.entries({ ...p, ...patch }).filter(([, v]) => v !== null))
    const ends = alignedEndsOf({ ...line, props: { ...props, via: undefined } }, rects, elbow, lines)
    if (ends) Object.assign(patch, ends, { via: null })
  }
  return patch
}
