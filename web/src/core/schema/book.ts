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
// ステージエントリが持つ設定の項目（holder が "outermost" の項目）の id
type OutermostSettingId = {
  [K in keyof SettingTable]: SettingTable[K] extends { holder: "outermost" } ? K : never
}[keyof SettingTable]

// タイプがページに足すフィールド（fields）
type PageFields<T> = T extends { fields: infer F extends Readonly<Record<string, z.ZodType>> }
  ? z.output<z.ZodObject<{ -readonly [K in keyof F]: F[K] }>>
  : unknown

// タイプ T のページ（置けるのは、タイプが選んだアイテムだけ。設定の項目の値は、タイプが選んだページの項目だけ）
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
  settings?: OutermostSettings
}
// ステージエントリが持つ設定の項目の値（settings のフィールドの中身）
export type OutermostSettings = SettingValuesOf<OutermostSettingId>
// 参照エントリ: ほかの所のページ（バインダの外の物）かバインダを id で指す、ブックの並びの 1 つ。中身・名前・設定を持たず、指す先を見るだけで描く
export interface ReferenceEntry {
  kind: "reference"
  id: string
  of: { kind: "page" | "binder"; id: string }
}
export type LineupEntry = AnyPage | BinderEntry | ReferenceEntry

// ステージで開く物の並び: その物の id と、並び lineup（ブックならその id と並び、ブックの外のバインダならその id と、そのバインダ 1 つだけの並び）
export type StageLineup = {
  id: string
  lineup: readonly LineupEntry[]
}

// ブック（名前 title・ロック locked・並び lineup・ステージエントリが持つ設定の項目）
export type Book = StageLineup & {
  title: string
  locked?: true
} & SettingFields<OutermostSettingId>

export type { Page } from "./page"
export { PageSchema } from "./page"
