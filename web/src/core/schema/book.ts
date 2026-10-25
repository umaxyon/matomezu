// ブックのデータの型。形はブックのタイプ（type）ごとに違う。タイプが自分で持つ欄に、タイプが選んだものから決まる欄
// （ページと、そこに置けるアイテム・設定の項目）を足す。ここは、機能台帳の型の側（core/catalog.ts）に書き足したタイプの型を 1 つに束ねる。
// データを検査する形は、機能台帳の core の段が同じ決まりで組み立てる（CoreCatalog の schemas と bookSchema）
import type { z } from "zod"
import type { BookTypeId, BookTypeTable, SettingTable } from "../catalog"
import type { PlacedOf } from "../placed"
import type { Page } from "./page"

// 選んだ設定の項目の欄（どれも書かなくてよい）
type SettingFields<Ids> = [Ids] extends [never] ? unknown : SettingFieldsOf<Ids>
type SettingFieldsOf<Ids> = {
  [K in Ids & keyof SettingTable as SettingTable[K] extends { field: infer F extends string }
    ? F
    : never]?: SettingTable[K] extends {
    schema: infer S extends z.ZodType
  }
    ? z.output<S>
    : never
}
type Selected<T, Of extends "book" | "page"> = T extends { settings: { [k in Of]: readonly (infer I)[] } } ? I : never

// タイプ T のページ（置けるのは、タイプが選んだアイテムだけ）
export type PageOf<T> = Page & {
  items?: PlacedOf<T extends { items: { allowed: readonly (infer I extends string)[] } } ? I : never>[]
} & SettingFields<Selected<T, "page">>

// タイプ T のブック
export type BookData<T> = (T extends { schema: infer S extends z.ZodType } ? z.output<S> : never) &
  (T extends { pages: null } ? unknown : { pages: PageOf<T>[] }) &
  SettingFields<Selected<T, "book">>

// 書き足したブックのタイプごとの、データの型の和
export type Book = { [K in BookTypeId]: BookData<BookTypeTable[K]> }[BookTypeId]
export type BookOf<T extends Book["type"]> = Extract<Book, { type: T }>
export type { Page } from "./page"
export { PageSchema } from "./page"
