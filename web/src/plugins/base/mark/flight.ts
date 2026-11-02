// 鳥のマークの動き: 時刻 t（秒）の姿（どのコマを、歩く所のどこに、どの向きで出すか）を返す純粋な計算。
// 付けたときだけ、画面の外から飛んでくる（fly）か、物の裏から顔を出してキョロキョロしてから上の辺へ飛び乗る（peek）。そのあとは上の辺を往復して歩き、
// 端ごとに立ち止まってその鳥の仕草をする
import type { Point } from "../../../core/geom"
import type { Bird } from "."

export type Arrival = "fly" | "peek" | "none"

// 鳥ごとの歩き方（walk は片道の秒、step は 1 コマの秒、gesture は仕草の秒。gait は歩くときの体の動き）
export interface Gait {
  walk: number
  step: number
  gesture: number
  gait: "walk" | "hop" | "bounce" | "sway"
}

export const GAITS: Record<Bird, Gait> = {
  tsunagidori: { walk: 6, step: 0.32, gesture: 2.4, gait: "walk" },
  inko: { walk: 5.6, step: 0.26, gesture: 2.8, gait: "bounce" },
  buncho: { walk: 6, step: 0.22, gesture: 2.6, gait: "walk" },
  suzume: { walk: 6.4, step: 0.23, gesture: 2.6, gait: "hop" },
  fukurou: { walk: 8, step: 0.48, gesture: 3.2, gait: "sway" },
}

export interface Pose {
  frame: number // コマの番号（frames.ts）
  x: number // 歩く所の左端からの、足元の位置
  lift: number // 上の辺からの足元の高さ（上が負）
  from: Point // 飛んでくる途中の、降りる所からのずれ（それ以外は 0）
  right: boolean // 右を向く（絵は左向きなので、左右を返す）
  rotation: number // 体の傾き（ラジアン）
  behind: boolean // 物の裏にいる（上の辺より下を隠す）
}

const FLY = 2.1 // 飛んでくる秒
const LAND = 0.4 // 着地の秒
const PEEK = 4 // 顔を出してから着地するまでの秒

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => {
  const c = clamp(x)
  return c * c * (3 - 2 * c)
}
const NO_SHIFT: Point = { x: 0, y: 0 }

const gestureFrame = (t: number, duration: number) =>
  [12, 12, 13, 13, 14, 14, 15, 15][Math.min(7, Math.floor(clamp(t / duration) * 8))] ?? 12

// 降りたあと。range は往復する幅、size は鳥の大きさ（px）。最初は右端から左へ歩く
function walking(t: number, g: Gait, size: number, range: number): Pose {
  const leg = g.walk + g.gesture
  const phase = t % (2 * leg)
  const right = phase >= leg
  const local = phase % leg
  const moving = local < g.walk
  let fraction = clamp(local / g.walk)
  let lift = 0
  let rotation = 0
  if (moving && g.gait === "hop") {
    const steps = Math.round(g.walk / (g.step * 4))
    const progress = (local / g.walk) * steps
    const whole = Math.floor(progress)
    const part = clamp((progress - whole - 0.1) / 0.7)
    fraction = (whole + ease(part)) / steps
    lift = -Math.sin(Math.PI * part) * size * 0.075
  }
  if (moving && g.gait === "bounce") lift = -Math.abs(Math.sin(((local / g.step) * Math.PI) / 2)) * size * 0.025
  if (moving && g.gait === "sway") rotation = Math.sin(((local / g.step) * Math.PI) / 2) * 0.025
  return {
    frame: moving ? 8 + (Math.floor(local / g.step) % 4) : gestureFrame(local - g.walk, g.gesture),
    x: range * (right ? fraction : 1 - fraction),
    lift,
    from: NO_SHIFT,
    right,
    rotation,
    behind: false,
  }
}

// 時刻 t の姿。from は飛んでくる所（降りる所からのずれ。画面の外）
export function birdPose(t: number, arrival: Arrival, g: Gait, size: number, range: number, from: Point): Pose {
  const still = { x: range, from: NO_SHIFT, right: false, rotation: 0 }
  if (arrival === "fly") {
    if (t < FLY) {
      const left = 1 - ease(t / FLY)
      return {
        ...still,
        frame: t < FLY - 0.4 ? Math.floor(t / 0.16) % 2 : 2,
        lift: 0,
        from: { x: from.x * left, y: from.y * left },
        right: from.x < 0,
        behind: false,
      }
    }
    if (t < FLY + LAND) return { ...still, frame: 3, lift: 0, behind: false }
    return walking(t - (FLY + LAND), g, size, range)
  }
  if (arrival === "peek") {
    if (t < 0.35) return { ...still, frame: 4, lift: size, behind: true }
    if (t < 0.55) return { ...still, frame: 4, lift: size * (1 - 0.65 * ease((t - 0.35) / 0.2)), behind: true }
    if (t < 2.6) {
      const look = [4, 5, 4, 6, 4][Math.min(4, Math.floor((t - 0.55) / 0.41))] ?? 4
      return { ...still, frame: look, lift: size * 0.35, behind: true }
    }
    if (t < 2.8) return { ...still, frame: 4, lift: size * (0.35 + 0.1 * ease((t - 2.6) / 0.2)), behind: true }
    if (t < 3.6) {
      const q = clamp((t - 2.8) / 0.8)
      return {
        ...still,
        frame: q < 0.68 ? 7 : 2,
        lift: size * (0.45 * (1 - q) - 0.8 * Math.sin(Math.PI * q)),
        behind: q < 0.25,
      }
    }
    if (t < PEEK) return { ...still, frame: 3, lift: 0, behind: false }
    return walking(t - PEEK, g, size, range)
  }
  return walking(t, g, size, range)
}
