// ページのデータの形のうち、どのタイプのページも持つ土台のフィールド（タイプごとのフィールドは、機能台帳がタイプの定義から足す。core-catalog.ts）。
// 紙の id は機能台帳の紙に無いものも受け取って残す（外した紙のデータを壊さない。描き方は core/paper.ts の resolvePaper）
import { z } from "zod"
import { GROW_CHOICES, ORIENTATIONS } from "../def/paper"

export const PageSchema = z.strictObject({
  // 並びの中での種類（ブックの並びには、ページとフォルダが入る。見分けは形でなく、この名前でする）
  kind: z.literal("page"),
  id: z.string().min(1),
  type: z.string().min(1), // ページのタイプの id（作ったあとは変えない）
  title: z.string(),
  paper: z.string().min(1),
  orientation: z.enum(ORIENTATIONS),
  // 可変ページ（ページのタイプが増やす向きの決め方を持つときだけ）。利用者が向きを選ぶタイプは選んだ向き、タイプが決めるタイプは true
  grows: z.union([z.literal(true), z.enum(GROW_CHOICES)]).optional(),
  // 上・左へも伸びる可変ページで、中身を右・下へずらした量の累計（印刷区画の数。詰めれば減る）。開いている画面は、変わった分だけパンを合わせる
  shift: z.strictObject({ x: z.number().int(), y: z.number().int() }).optional(),
  locked: z.literal(true).optional(), // ロック中（利用者も AI も中身を変えられない。外せるのは利用者だけ）
})

export type Page = z.infer<typeof PageSchema>
