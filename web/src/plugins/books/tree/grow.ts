// 伸びる向き: 木が根からどちらへ伸びるか（上・下・左・右・中央）。ブックとページの設定の項目で持ち、ページはブックを継承できる
import { z } from "zod"
import { kit } from "./kit"

export const GROWS = ["up", "down", "left", "right", "center"] as const
export type Grow = (typeof GROWS)[number]

export const GROW = kit.defineSetting({
  id: "grow",
  title: "Grow direction",
  schema: z.enum(GROWS),
  default: "down",
})
