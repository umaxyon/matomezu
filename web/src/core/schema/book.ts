// ブックとページのデータの形。ブックはタイプ（type）ごとに形が違う。
// 図面（drawing）はページを持ち、ページに紙を置く。マスター（master）はブックの一覧や設定などを集める画面で、ページも紙も持たない
import { z } from "zod"

export const PageSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
})

export const DrawingBookSchema = z.strictObject({
  type: z.literal("drawing"),
  id: z.string().min(1),
  title: z.string(),
  pages: z.array(PageSchema).min(1),
})

// 名前は画面の言葉（t("マスター")）で出すので、題名を持たない
export const MasterBookSchema = z.strictObject({
  type: z.literal("master"),
  id: z.string().min(1),
})

export const BookSchema = z.discriminatedUnion("type", [DrawingBookSchema, MasterBookSchema])

export type Page = z.infer<typeof PageSchema>
export type DrawingBook = z.infer<typeof DrawingBookSchema>
export type MasterBook = z.infer<typeof MasterBookSchema>
export type Book = z.infer<typeof BookSchema>
export type BookType = Book["type"]
