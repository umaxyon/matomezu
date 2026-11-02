// 伸びる向き: 木が根からどちらへ伸びるか（上・下・左・右・中央）。ブックとページの設定の項目で持ち、ページはブックを継承できる
import { z } from "zod"
import type { GrowSides } from "../../base"
import { kit } from "./kit"

export const GROWS = ["up", "down", "left", "right", "center"] as const
export type Grow = (typeof GROWS)[number]

export const GROW = kit.defineSetting({
  id: "grow",
  title: "Grow direction",
  schema: z.enum(GROWS),
  default: "down",
})

// 可変ページの増やす向き: 根のある側は増やさず、ほかの 3 つの向きへ（中央なら 4 つとも）
export function growSidesOf(grow: Grow): GrowSides {
  if (grow === "center") return { up: true, down: true, left: true, right: true }
  return { up: grow !== "down", down: grow !== "up", left: grow !== "right", right: grow !== "left" }
}
