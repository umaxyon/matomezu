// 線に付けた鳥の動き: 線の形（スタンドの左上から測った点の並び）から、線の上を歩くか、線の周りを飛ぶかを決め、鳥の足元の位置と傾きを返す純粋な計算。
// 点が 2 つだけ（途中の点が一直線上なら省く）で、横から WALK_TILT 以内の傾きなら歩く（足元は線の上で、体を線の傾きに合わせる）。折れ線・縦・急な斜めなら、線の長さの真ん中の周りを周回する
import type { Point } from "../../../core/geom"

export const WALK_TILT = (10 * Math.PI) / 180 // 歩ける線の、横からの傾きの上限
const STRAIGHT = 1 // 一直線とみなす、点から直線までのずれ（px）

export type LineMotion = { kind: "walk"; from: Point; to: Point } | { kind: "orbit" }

// 点の並び path（2 つ以上）のうち、前後の点を結ぶ直線上にある点と、重なった点を省いた並び
export function simplified(path: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of path) {
    const last = out.at(-1)
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1e-6) continue
    const before = out.at(-2)
    if (last && before) {
      const dx = last.x - before.x
      const dy = last.y - before.y
      const off = Math.abs(dx * (p.y - before.y) - dy * (p.x - before.x)) / Math.hypot(dx, dy)
      const ahead = dx * (p.x - last.x) + dy * (p.y - last.y) > 0
      if (off <= STRAIGHT && ahead) {
        out[out.length - 1] = p
        continue
      }
    }
    out.push(p)
  }
  return out
}

// 線の動き: 歩くなら、歩く線の左の端 from と右の端 to
export function lineMotion(path: readonly Point[]): LineMotion {
  const pts = simplified(path)
  const a = pts[0]
  const b = pts[1]
  if (pts.length !== 2 || !a || !b) return { kind: "orbit" }
  const [from, to] = a.x <= b.x ? [a, b] : [b, a]
  return Math.abs(Math.atan2(to.y - from.y, to.x - from.x)) <= WALK_TILT
    ? { kind: "walk", from, to }
    : { kind: "orbit" }
}

export interface Place {
  x: number
  y: number
  angle: number // その点での線の向き（ラジアン。-π/2 より大きく π/2 以下の、右下がりが正）
}

// 線の左の端 from から右の端 to へ、端から along（px）進んだ点と、線の向き
export function onSegment(from: Point, to: Point, along: number): Place {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const t = length === 0 ? 0 : along / length
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    angle: Math.atan2(to.y - from.y, to.x - from.x),
  }
}

// 線の長さ
export function lengthOf(path: readonly Point[]): number {
  let sum = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point
    const b = path[i] as Point
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum
}

// 線の長さの真ん中の点と、その区間の向き（向きは右向きに直す。折れ線も、真ん中の区間の向き）
export function middleOf(path: readonly Point[]): Place {
  const half = lengthOf(path) / 2
  let walked = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point
    const b = path[i] as Point
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (walked + length >= half || i === path.length - 1) {
      const [from, to] = a.x <= b.x ? [a, b] : [b, a]
      const along = a.x <= b.x ? half - walked : length - (half - walked)
      const place = onSegment(from, to, along)
      return a.x === b.x ? { ...place, angle: Math.PI / 2 } : place
    }
    walked += length
  }
  const only = path[0] ?? { x: 0, y: 0 }
  return { x: only.x, y: only.y, angle: 0 }
}

// 周回: 時刻 t（秒）の、周回の中心からの位置・大きさ・透明度・向き・コマ。手前を 3/4 の時間で回り、奥に回ると小さく透明になる
const ORBIT_SECONDS = 2
const RADIUS_X = 46
const RADIUS_Y = 17
const FLATTEN = 0.85
const FRONT_FRACTION = 0.75
const BIAS = Math.PI * (FRONT_FRACTION - 0.5)

export interface Orbit {
  x: number
  y: number
  scale: number
  opacity: number
  right: boolean
  rotation: number
  frame: number // 羽ばたきのコマ（0 か 1）
}

const smooth = (a: number, b: number, x: number) => {
  const q = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return q * q * (3 - 2 * q)
}

export function orbitPose(t: number): Orbit {
  const phase = (((t % ORBIT_SECONDS) + ORBIT_SECONDS) % ORBIT_SECONDS) / ORBIT_SECONDS
  const elapsed = phase * Math.PI * 2
  let angle = elapsed
  for (let i = 0; i < 10; i++) angle -= (angle + BIAS * Math.sin(angle) - elapsed) / (1 + BIAS * Math.cos(angle))
  const front = (1 + Math.cos(angle)) / 2
  const x = RADIUS_X * Math.sin(angle)
  return {
    x,
    y: FLATTEN * (0.35 * x + RADIUS_Y * Math.cos(angle)),
    scale: 0.17 + 0.83 * front ** 1.1,
    opacity: smooth(0.025, 0.14, front),
    right: Math.cos(angle) > 0,
    rotation: 0.14 * Math.sin(angle),
    frame: Math.floor((phase * ORBIT_SECONDS + 1e-7) * 6) % 2,
  }
}

// 周回の体の中心から、足元までの下の距離（鳥の大きさ 1 のとき。px）
export const ORBIT_FOOT = 13

export interface Footing {
  x: number
  y: number
  tilt: number // 線の向きに合わせる体の傾き（ラジアン。周回では 0）
}

// 鳥の足元の、スタンドの左上から測った位置と傾き。still なら線の真ん中に線の向きで立つ。歩くなら、歩く幅 range を線の真ん中に置いて、左の端から x 進んだ点。
// 周回なら、線の真ん中から hover だけ離れた体の中心の下にある足元（体を rotation だけ傾けたときの、大きさ scale 倍の足元）
export function footing(
  path: readonly Point[],
  motion: LineMotion,
  pose: { x: number; hover?: Point | undefined; scale?: number | undefined; rotation: number },
  range: number,
  still: boolean,
): Footing {
  if (still || motion.kind === "walk") {
    const place =
      still || motion.kind !== "walk"
        ? middleOf(path)
        : onSegment(motion.from, motion.to, (lengthOf([motion.from, motion.to]) - range) / 2 + pose.x)
    return { x: place.x, y: place.y, tilt: place.angle }
  }
  const middle = middleOf(path)
  const hover = pose.hover ?? { x: 0, y: 0 }
  const drop = ORBIT_FOOT * (pose.scale ?? 1)
  return {
    x: middle.x + hover.x - Math.sin(pose.rotation) * drop,
    y: middle.y + hover.y + Math.cos(pose.rotation) * drop,
    tilt: 0,
  }
}
