// ページのデータの形（ページを持つブックのタイプが使う）。
// 紙の id は登録表の紙に無いものも受け取って残す（外した紙のデータを壊さない。描き方は core/paper.ts の resolvePaper）
import { z } from "zod"
import { ORIENTATIONS } from "../def/paper"

export const PageSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  paper: z.string().min(1),
  orientation: z.enum(ORIENTATIONS),
})

export type Page = z.infer<typeof PageSchema>
