// ブックのデータの型。形はブックのタイプ（type）ごとに違う。タイプが自分で持つフィールドに、タイプが選んだものから決まるフィールド
// （ページと、そこに置けるアイテム・設定の項目）を足す。ここは、core/catalog.ts の BookTypeTable に書き足したタイプの型を 1 つに束ねる。
// データを検査する形は、機能台帳の core の段が同じ決まりで組み立てる（CoreCatalog の schemas と bookSchema）
import type { z } from "zod"
import type { BookTypeId, BookTypeTable, SettingTable } from "../catalog"
import type { PlacedOf } from "../placed"
import type { Page } from "./page"

// 選んだ設定の項目のフィールド: settings の中に、項目の id を鍵にして値を持つ（どれも書かなくてよい）
type SettingFields<Ids> = [Ids] extends [never] ? unknown : { settings?: SettingValuesOf<Ids> }
type SettingValuesOf<Ids> = {
  [K in Ids & keyof SettingTable]?: SettingTable[K] extends { schema: infer S extends z.ZodType } ? z.output<S> : never
}
type Selected<T, Of extends "book" | "page"> = T extends { settings: { [k in Of]: readonly (infer I)[] } } ? I : never

// タイプがページに足すフィールド（pages.fields）
type PageFields<T> = T extends { pages: { fields: infer F extends Readonly<Record<string, z.ZodType>> } }
  ? z.output<z.ZodObject<{ -readonly [K in keyof F]: F[K] }>>
  : unknown

// タイプ T のページ（置けるのは、タイプが選んだアイテムだけ）
export type PageOf<T> = Page &
  PageFields<T> & {
    items?: PlacedOf<T extends { items: { allowed: readonly (infer I extends string)[] } } ? I : never>[]
  } & SettingFields<Selected<T, "page">>

// タイプ T のブック（名前 title は土台のフィールドで、どのタイプのブックも持つ。空でもよい）
export type BookData<T> = (T extends { schema: infer S extends z.ZodType } ? z.output<S> : never) & {
  title: string
} & (T extends { pages: null } ? unknown : { pages: PageOf<T>[] }) &
  SettingFields<Selected<T, "book">>

// 書き足したブックのタイプごとの、データの型の和
export type Book = { [K in BookTypeId]: BookData<BookTypeTable[K]> }[BookTypeId]
export type BookOf<T extends Book["type"]> = Extract<Book, { type: T }>
export type { Page } from "./page"
export { PageSchema } from "./page"
