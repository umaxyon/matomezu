// ブックのデータの型。形はブックのタイプ（type）ごとに違い、各タイプの定義（core/book-types）が持つ。ここはその型を 1 つに束ねる。
// データを検査する形は、登録表が自分のブックのタイプから作る（Registry の bookSchema）
import type { z } from "zod"
import type { BOOK_TYPES } from "../book-types"

// 表の並びのままの、各タイプの形の組
type SchemasOf<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? [H extends { schema: infer S } ? S : never, ...SchemasOf<R>]
  : []
type Schemas = SchemasOf<typeof BOOK_TYPES>

export type Book = z.infer<Schemas[number]>
export type BookOf<T extends Book["type"]> = Extract<Book, { type: T }>
export type { Page } from "./page"
export { PageSchema } from "./page"
