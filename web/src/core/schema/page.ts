// ページのデータの形（ページを持つブックのタイプが使う）
import { z } from "zod"
import { PAPER_NAMES } from "../paper"

export const PageSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  paper: z.enum(PAPER_NAMES),
})

export type Page = z.infer<typeof PageSchema>
