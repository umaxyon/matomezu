// ブックとページのデータの型。ブックはタイプを持たず、並び（lineup）にページとバインダを順に持つ。ページの形はページのタイプ（type）ごとに違い、
// 土台のフィールドに、タイプが選んだものから決まるフィールド（置けるアイテム・設定の項目・タイプが足すフィールド）を足す。
// ここは、core/catalog.ts の PageTypeTable に書き足したタイプの型を 1 つに束ねる。データを検査する形は、core 台帳が同じ決まりで組み立てる（CoreCatalog の schemas と bookSchema）
import type { z } from "zod"
import type { PageTypeId, PageTypeTable, SettingTable } from "../catalog"
import type { PlacedOf } from "../placed"
import type { WarningCode } from "../warnings"
import type { Page } from "./page"

// 選んだ設定の項目のフィールド: settings の中に、項目の id を鍵にして値を持つ（どれも書かなくてよい）
type SettingFields<Ids> = [Ids] extends [never] ? unknown : { settings?: SettingValuesOf<Ids> }
type SettingValuesOf<Ids> = {
  [K in Ids & keyof SettingTable]?: SettingTable[K] extends { schema: infer S extends z.ZodType } ? z.output<S> : never
}
type Selected<T> = T extends { settings: readonly (infer I)[] } ? I : never
// ブックが持つ設定の項目（holder が "outermost" の項目）の id
type BookSettingId = {
  [K in keyof SettingTable]: SettingTable[K] extends { holder: "outermost" } ? K : never
}[keyof SettingTable]

// タイプがページに足すフィールド（fields）
type PageFields<T> = T extends { fields: infer F extends Readonly<Record<string, z.ZodType>> }
  ? z.output<z.ZodObject<{ -readonly [K in keyof F]: F[K] }>>
  : unknown

// タイプ T のページ（置けるのは、タイプが選んだアイテムだけ）
export type PageData<T> = Page &
  (T extends { id: infer Id extends string } ? { type: Id } : unknown) &
  PageFields<T> & {
    items?: readonly PlacedOf<T extends { items: { allowed: readonly (infer I extends string)[] } } ? I : never>[]
  } & SettingFields<Selected<T>>

// 書き足したページのタイプごとの、ページのデータの型の和（type で分かれる）。Page は、どのタイプのページも持つ土台のフィールドだけの型
export type AnyPage = { [K in PageTypeId]: PageData<PageTypeTable[K]> }[PageTypeId]
export type PageOf<T extends PageTypeId> = PageData<PageTypeTable[T]>

// 読めないページの理由の warning の番号（タイプが機能台帳に無い・タイプの形に合わない・タイプの決まりを守らない）
export const UNREADABLE_CODES = ["W027", "W028", "W029"] as const satisfies readonly WarningCode[]
export type UnreadableCode = (typeof UNREADABLE_CODES)[number]

// エントリ 1 つ: ページ（kind: "page"）か、1 つのタイプのページだけを入れるバインダ（kind: "binder"。中身も同じ並びで、入るのはページだけ）。
// どれも並びの中で id を持つ（置き直しの Patch が、並びを id ごとにたどる。core/patch.ts）
export interface BinderEntry {
  kind: "binder"
  id: string
  title: string
  pageType: string // 入れるページのタイプの id
  lineup: readonly AnyPage[]
}
export type LineupEntry = AnyPage | BinderEntry

// ブック（名前 title・ロック locked・並び lineup・ブックが持つ設定の項目）
export type Book = {
  id: string
  title: string
  locked?: true
  lineup: readonly LineupEntry[]
} & SettingFields<BookSettingId>

export type { Page } from "./page"
export { PageSchema } from "./page"
