// 描画シェイプの四角の計算（紙の上の px。角度は度で、時計回り、四角の中心まわり）。つまみで大きさを変えたときの新しい四角と、回すつまみで決まる角度、ドラッグで描いた線の四角。
// 大きさを変えるときは、つかんでいない側の辺（角なら向かいの角）が紙の上で動かないようにする
import type { PlacedShape, Point, Rect } from "../../../plugin-api"

// 形のアイテムの props（描画シェイプの項目を名前で読む）
export const shapeProps = (shape: PlacedShape): Record<string, unknown> => shape.props as Record<string, unknown>
// 形のアイテムの角度（度。書いていなければ 0）
export const rotationOf = (shape: PlacedShape): number => (shapeProps(shape).rotation as number | undefined) ?? 0

// つかんだ辺（角なら 2 つ）
export interface Grip {
  left?: boolean
  right?: boolean
  top?: boolean
  bottom?: boolean
}

const rad = (deg: number): number => (deg * Math.PI) / 180

// 点 p を原点のまわりに deg 度（時計回り）回す
export function turn(p: Point, deg: number): Point {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

export const centerOf = (f: Rect): Point => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 })

// 四角の四隅の紙の上の位置（左上・右上・右下・左下の順。角度をかけたあと）
export function cornersOf(f: Rect, rotation: number): readonly Point[] {
  const c = centerOf(f)
  return [
    { x: -f.w / 2, y: -f.h / 2 },
    { x: f.w / 2, y: -f.h / 2 },
    { x: f.w / 2, y: f.h / 2 },
    { x: -f.w / 2, y: f.h / 2 },
  ].map(p => {
    const t = turn(p, rotation)
    return { x: c.x + t.x, y: c.y + t.y }
  })
}

export interface Resized extends Rect {
  scaled: boolean // 角をつかんだ（文字枠の文字も一緒に拡大する）
}

// grip をつかんで、紙の上で by だけ引いたあとの枠。min は幅・高さの下限。square なら、角をつかんだとき正方形（長い方に揃える）
export function resizedRect(f: Rect, rotation: number, grip: Grip, by: Point, min: number, square = false): Resized {
  const d = turn(by, -rotation)
  const horizontal = grip.left === true || grip.right === true
  const vertical = grip.top === true || grip.bottom === true
  let l = grip.left ? d.x : 0
  let r = f.w + (grip.right ? d.x : 0)
  let t = grip.top ? d.y : 0
  let b = f.h + (grip.bottom ? d.y : 0)
  // 下限より小さくならないよう、つかんだ辺を止める
  if (r - l < min) {
    if (grip.left) l = r - min
    else r = l + min
  }
  if (b - t < min) {
    if (grip.top) t = b - min
    else b = t + min
  }
  // 角をつかんで square なら、縦横の長い方に揃える（つかんだ角の反対側の角を動かさない）
  if (square && horizontal && vertical) {
    const side = Math.max(r - l, b - t)
    if (grip.left) l = r - side
    else r = l + side
    if (grip.top) t = b - side
    else b = t + side
  }
  const w = r - l
  const h = b - t
  // 新しい中心は、古い中心から枠の中で動いた分を、角度をかけて紙の上に直した所
  const shift = turn({ x: (l + r) / 2 - f.w / 2, y: (t + b) / 2 - f.h / 2 }, rotation)
  const c = centerOf(f)
  return { x: c.x + shift.x - w / 2, y: c.y + shift.y - h / 2, w, h, scaled: horizontal && vertical }
}

// 枠 f を、幅 w・高さ h に合わせた枠（右と下が動き、左上の角は、角度をかけたあとの紙の上で動かない。広がることも縮むこともある）
export function fittedRect(f: Rect, rotation: number, need: { w: number; h: number }): Rect {
  const dw = need.w - f.w
  const dh = need.h - f.h
  if (dw === 0 && dh === 0) return f
  const { x, y, w, h } = resizedRect(f, rotation, { right: true, bottom: true }, turn({ x: dw, y: dh }, rotation), 0)
  return { x, y, w, h }
}

// 角度を -180 を超え 180 以下にそろえる
export function normalizeAngle(deg: number): number {
  const m = ((((deg + 180) % 360) + 360) % 360) - 180
  return m === -180 ? 180 : m
}

// 回すつまみをつかんだときの角度 from から、ポインタが center のまわりに start の向きから now の向きへ動いたあとの角度。snap（度）を渡せば、その倍数に丸める
export function rotatedTo(from: number, center: Point, start: Point, now: Point, snap?: number): number {
  const a = Math.atan2(start.y - center.y, start.x - center.x)
  const b = Math.atan2(now.y - center.y, now.x - center.x)
  const raw = from + ((b - a) * 180) / Math.PI
  const deg = snap ? Math.round(raw / snap) * snap : raw
  return normalizeAngle(Math.round(deg * 100) / 100)
}

// ドラッグで描いた点の並び points を入れる枠と、枠の中の割合にした点。枠は幅・高さが min 未満にならない（線が水平・垂直のとき）
export function drawnRect(points: readonly Point[], min: number): { rect: Rect; fractions: Point[] } {
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = Math.max(Math.max(...xs) - x, min)
  const h = Math.max(Math.max(...ys) - y, min)
  const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000))
  return {
    rect: { x, y, w, h },
    fractions: points.map(p => ({ x: clamp((p.x - x) / w), y: clamp((p.y - y) / h) })),
  }
}

// 点の並びを間引く（隣の点との間が dist 未満の点を捨てる。最後の点は残す）。ドラッグで描いた線の点を増やしすぎない
export function thinned(points: readonly Point[], dist: number): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out.at(-1)
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= dist) out.push(p)
  }
  const end = points.at(-1)
  if (end && out.at(-1) !== end) out.push(end)
  return out
}

// 角のつまみで幅が oldW から w になったときの、文字の大きさ fontSize の新しい値（幅の倍率で変え、小数 2 桁に丸める）
export const scaledFontSize = (fontSize: number, w: number, oldW: number): number =>
  Math.round(((fontSize * w) / oldW) * 100) / 100

// 角度をかけた四角を囲む、軸に沿った四角
export function boundsOf(f: Rect, rotation: number): Rect {
  const corners = cornersOf(f, rotation)
  const xs = corners.map(p => p.x)
  const ys = corners.map(p => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// 四角を全部囲む四角（無ければ null）
export function unionOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const x = Math.min(...rects.map(r => r.x))
  const y = Math.min(...rects.map(r => r.y))
  return {
    x,
    y,
    w: Math.max(...rects.map(r => r.x + r.w)) - x,
    h: Math.max(...rects.map(r => r.y + r.h)) - y,
  }
}

// 2 つの四角が重なるか（辺が触れるだけでも重なる）
export const touches = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h

// 2 点を向かい合う角にした四角（ドラッグ枠）
export const spanOf = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
})

// 線の点（枠の中の割合）を、紙の上の点にする（角度をかけたあと）
export function pointsOnPaper(rect: Rect, rotation: number, points: readonly Point[]): Point[] {
  const c = centerOf(rect)
  return points.map(p => {
    const t = turn({ x: (p.x - 0.5) * rect.w, y: (p.y - 0.5) * rect.h }, rotation)
    return { x: c.x + t.x, y: c.y + t.y }
  })
}

// 点 to を、点 from から見て 45 度ずつの向きに丸める（長さは保つ。水平・垂直・斜め）
export function snappedTo45(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  const length = Math.hypot(dx, dy)
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
}

// 線の点 index を、紙の上の点 to へ動かしたあとの、線を入れる枠と枠の中の割合の点。角度は無くなる（紙の上の見た目は変わらない）。min は枠の幅・高さの下限
export function movedPoint(
  rect: Rect,
  rotation: number,
  points: readonly Point[],
  index: number,
  to: Point,
  min: number,
): { rect: Rect; points: Point[] } {
  const onPaper = pointsOnPaper(rect, rotation, points)
  onPaper[index] = to
  const { rect: next, fractions } = drawnRect(onPaper, min)
  return { rect: next, points: fractions }
}

// 形のアイテムの四角（書いていない幅・高さは 0。描く形は layer.ts の sizedShapes で大きさを書いてから渡す）
export const rectOf = (shape: PlacedShape): Rect => ({ x: shape.x, y: shape.y, w: shape.w ?? 0, h: shape.h ?? 0 })
// 始めの点 start から今の点 at への縦横を、長い方に揃えた終わりの点
export function squaredEnd(start: Point, at: Point): Point {
  const side = Math.max(Math.abs(at.x - start.x), Math.abs(at.y - start.y))
  return { x: start.x + (at.x < start.x ? -side : side), y: start.y + (at.y < start.y ? -side : side) }
}
// 書く位置と大きさの丸め（小数 2 桁）
export const round = (n: number): number => Math.round(n * 100) / 100
export const roundRect = (f: Rect): Rect => ({ x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h) })
