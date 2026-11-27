// コンテキストの棒: 参加者の会話の今のコンテキストの量を、物差しに対する割合と数で見せる形。物差しの選びと 9 割の判断は、ここ 1 か所で決める。
// 物差しは利用者の設定の項目 context-scale で選ぶ（自動か、決まった量）
import { z } from "zod"
import type { ContextUse } from "../../../store/state"
import { kit } from "../kit"

// 会話の今のコンテキストの量が分からない（知らされていない・読めない）ときと、棒を出さないときの値
export const NO_CONTEXT_USE = "none"

// 物差しの選び方: auto は AI の側の物差し（自動で縮める所、無ければモデルの上限。ContextUse の aiScale）、数はその量（トークン）
export type ContextScale = "auto" | number

// 選べる物差しの量（トークン）
export const CONTEXT_SCALE_CHOICES = [200_000, 300_000, 500_000, 1_000_000] as const

// コンテキストバー上限（利用者の設定の項目）: auto か、CONTEXT_SCALE_CHOICES の量
export const CONTEXT_SCALE = kit.defineSetting({
  id: "context-scale",
  title: "Context bar limit",
  help: kit.message(
    "Auto: Claude Code's autoCompactWindow setting, or the model's limit without it (1M for every Claude model now). Claude only for now",
  ),
  schema: z.union([z.literal("auto"), ...CONTEXT_SCALE_CHOICES.map(n => z.literal(n))]),
  default: "auto",
  optionTitles: {
    auto: kit.message("Auto"),
    "200000": kit.message("200K"),
    "300000": kit.message("300K"),
    "500000": kit.message("500K"),
    "1000000": kit.message("1M"),
  },
})

// 利用者の設定の項目 context-scale の値 value を物差しにする（数でなければ auto）
export const contextScaleOf = (value: unknown): ContextScale => (typeof value === "number" ? value : "auto")

// 棒と数を赤にする、物差しに対する割合
const NEAR_FULL = 0.9

export interface ContextGauge {
  readonly fill: number // 棒を満たす割合（0 から 1。物差しを超えたら 1）
  readonly fillByMatomezu: number // 棒のうち、matomezu が使っている分で塗る割合（0 から fill。分からなければ 0）
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
  const fill = Math.min(Math.max(ratio, 0), 1)
  return {
    fill,
    fillByMatomezu: Math.min(Math.max(use.byMatomezu / size, 0), fill),
    thousands: Math.round(use.used / 1000),
    nearFull: ratio >= NEAR_FULL,
  }
}
