// ページのデータの形（ページを持つブックのタイプが使う）。
// 紙の id は機能台帳の紙に無いものも受け取って残す（外した紙のデータを壊さない。描き方は core/paper.ts の resolvePaper）
import { z } from "zod"
import { GROW_CHOICES, ORIENTATIONS } from "../def/paper"

export const PageSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  paper: z.string().min(1),
  orientation: z.enum(ORIENTATIONS),
  // 可変ページ（ブックのタイプが増やす向きの決め方を持つときだけ）。利用者が向きを選ぶタイプは選んだ向き、タイプが決めるタイプは true
  grows: z.union([z.literal(true), z.enum(GROW_CHOICES)]).optional(),
  // 上・左へも伸びる可変ページで、中身を右・下へずらした量の累計（印刷区画の数。詰めれば減る）。開いている画面は、変わった分だけパンを合わせる
  shift: z.strictObject({ x: z.number().int(), y: z.number().int() }).optional(),
  locked: z.literal(true).optional(), // ロック中（利用者も AI も中身を変えられない。外せるのは利用者だけ）
})

export type Page = z.infer<typeof PageSchema>
