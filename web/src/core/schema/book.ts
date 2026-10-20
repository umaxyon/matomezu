// ブックのデータの形。形はブックのタイプ（type）ごとに違い、各タイプの定義（core/book-types）が持つ。ここはそれを 1 つに束ねる
import { z } from "zod"
import { BOOK_TYPES } from "../book-types"

// 表の並びのままの、各タイプの形の組
type SchemasOf<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? [H extends { schema: infer S } ? S : never, ...SchemasOf<R>]
  : []
type Schemas = SchemasOf<typeof BOOK_TYPES>

export const BookSchema = z.discriminatedUnion("type", BOOK_TYPES.map(t => t.schema) as unknown as Schemas)

export type Book = z.infer<typeof BookSchema>
export type BookOf<T extends Book["type"]> = Extract<Book, { type: T }>
export type { Page } from "./page"
export { PageSchema } from "./page"
