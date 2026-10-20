// ページのデータの形（ページを持つブックのタイプが使う）
import { z } from "zod"

export const PageSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
})

export type Page = z.infer<typeof PageSchema>
