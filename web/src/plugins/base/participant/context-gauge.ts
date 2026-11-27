// コンテキストの棒: 参加者の会話の今のコンテキストの量を、物差しに対する割合と数で見せる形。物差しの選びと 9 割の判断は、ここ 1 か所で決める
import type { ContextUse } from "../../../store/state"

// 会話の今のコンテキストの量が分からない（知らされていない・読めない）ときと、棒を出さないときの値
export const NO_CONTEXT_USE = "none"

// 物差しの選び方: auto は AI の側の物差し（自動で縮める所、無ければモデルの上限。ContextUse の aiScale）、数はその量（トークン）
export type ContextScale = "auto" | number

// 棒と数を赤にする、物差しに対する割合
const NEAR_FULL = 0.9

export interface ContextGauge {
  readonly fill: number // 棒を満たす割合（0 から 1。物差しを超えたら 1）
  readonly thousands: number // 今の量を千で割って四捨五入した数（120k の 120）
  readonly nearFull: boolean // 今の量が物差しの 9 割以上か
}

// 会話の今のコンテキストの量 use を、物差し scale で見せる形（量が分からないか、物差しが正の数でなければ NO_CONTEXT_USE）
export function contextGauge(
  use: ContextUse | typeof NO_CONTEXT_USE,
  scale: ContextScale,
): ContextGauge | typeof NO_CONTEXT_USE {
  if (use === NO_CONTEXT_USE) return NO_CONTEXT_USE
  const size = scale === "auto" ? use.aiScale : scale
  if (!(size > 0)) return NO_CONTEXT_USE
  const ratio = use.used / size
  return { fill: Math.min(Math.max(ratio, 0), 1), thousands: Math.round(use.used / 1000), nearFull: ratio >= NEAR_FULL }
}
