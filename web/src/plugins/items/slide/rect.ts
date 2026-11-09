// スライドのアイテムの四角の計算（紙の上の px。角度は度で、時計回り、四角の中心まわり）。つまみで大きさを変えたときの新しい四角と、回すつまみで決まる角度、ドラッグで描いた線の四角。
// 大きさを変えるときは、つかんでいない側の辺（角なら向かいの角）が紙の上で動かないようにする
import type { Point, Rect } from "../../../plugin-api"

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

// 角か辺か（角は 2 つの辺をつかむ）
export const isCorner = (g: Grip): boolean =>
  (g.left === true || g.right === true) && (g.top === true || g.bottom === true)

export interface Resized extends Rect {
  scaled: boolean // 角をつかんだ（文字枠の文字も一緒に拡大する）
}

// 辺 grip をつかんで、紙の上で by だけ引いたあとの枠。min は幅・高さの下限。ratio（幅 ÷ 高さ）を渡せば、その比を保つ
export function resizedRect(f: Rect, rotation: number, grip: Grip, by: Point, min: number, ratio?: number): Resized {
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
  if (ratio !== undefined) {
    // 比を保つ: 角は幅に合わせて高さを決め（つかんでいない側の辺は動かさない）、辺は向かいの方向の真ん中を保って広げる
    const w = Math.max(r - l, min, min * ratio)
    const h = w / ratio
    if (horizontal && vertical) {
      if (grip.left) l = r - w
      else r = l + w
      if (grip.top) t = b - h
      else b = t + h
    } else if (horizontal) {
      if (grip.left) l = r - w
      else r = l + w
      const mid = (t + b) / 2
      t = mid - h / 2
      b = mid + h / 2
    } else {
      const h2 = Math.max(b - t, min, min / ratio)
      const w2 = h2 * ratio
      if (grip.top) t = b - h2
      else b = t + h2
      const mid = (l + r) / 2
      l = mid - w2 / 2
      r = mid + w2 / 2
    }
  }
  const w = r - l
  const h = b - t
  // 新しい中心は、古い中心から枠の中で動いた分を、角度をかけて紙の上に直した所
  const shift = turn({ x: (l + r) / 2 - f.w / 2, y: (t + b) / 2 - f.h / 2 }, rotation)
  const c = centerOf(f)
  return { x: c.x + shift.x - w / 2, y: c.y + shift.y - h / 2, w, h, scaled: horizontal && vertical }
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
