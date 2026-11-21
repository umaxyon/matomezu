// スライドを印刷に出すか: ページの設定の項目で持つ。
// auto は描画シェイプが 1 つでも紙に掛かれば出す（何も無いスライドは出さない）、always は何も無くても出し、never は出さない
import { z } from "zod"
import { kit } from "./kit"

export const SLIDE_PRINTS = ["auto", "always", "never"] as const
export type SlidePrint = (typeof SLIDE_PRINTS)[number]

export const SLIDE_PRINT = kit.defineSetting({
  id: "slide-print",
  holder: "page",
  title: "Print slides",
  schema: z.enum(SLIDE_PRINTS),
  default: "auto",
})
