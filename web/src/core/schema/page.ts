// ページのデータの形（ページを持つブックのタイプが使う）。
// 紙の id は機能台帳の紙に無いものも受け取って残す（外した紙のデータを壊さない。描き方は core/paper.ts の resolvePaper）
import { z } from "zod"
import { ORIENTATIONS } from "../def/paper"

export const PageSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  paper: z.string().min(1),
  orientation: z.enum(ORIENTATIONS),
  grows: z.literal(true).optional(), // 可変ページ（ブックのタイプが伸びられる向きを宣言したときだけ）
  // 上・左へも伸びる可変ページで、中身を右・下へずらした量の累計（印刷区画の数。詰めれば減る）。開いている画面は、変わった分だけパンを合わせる
  shift: z.strictObject({ x: z.number().int(), y: z.number().int() }).optional(),
  locked: z.literal(true).optional(), // ロック中（利用者も AI も中身を変えられない。外せるのは利用者だけ）
})

export type Page = z.infer<typeof PageSchema>
