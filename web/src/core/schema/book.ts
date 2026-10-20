// ブックのデータの型。形はブックのタイプ（type）ごとに違い、各タイプの定義が持つ。ここは、型の表（core/tables.ts）に書き足したタイプの型を 1 つに束ねる。
// データを検査する形は、登録表が自分のブックのタイプから作る（Registry の bookSchema）
import type { z } from "zod"
import type { BookTypeId, BookTypeTable } from "../tables"

// 書き足したブックのタイプごとの、データの型の和
export type Book = { [K in BookTypeId]: z.infer<BookTypeTable[K]["schema"]> }[BookTypeId]
export type BookOf<T extends Book["type"]> = Extract<Book, { type: T }>
export type { Page } from "./page"
export { PageSchema } from "./page"
