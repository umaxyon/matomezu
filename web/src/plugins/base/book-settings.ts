// ブックとページの設定の項目: ブックのタイプが設定の定義（core/def/setting.ts）を id で選び、機能台帳がブックとページの形に settings のフィールド（項目の id → 値）を足す。
// 変える base のアクション（book-update・page-update）は、名前などの共通の項目に加えて、選んだ項目を settings（項目の id → 値）として受け付ける。書いた項目だけを変え、null は項目を消す（既定に戻す）。
// 変えたあとはページを整える（settleBook）。値は ページ → ブック → 定義の既定 の順に、最初に値のある所で決まる（settingValue）。
// AI には、タイプごとの項目を引数の形に入れて見せる（settingsArgs）
import { z } from "zod"
import { hasPages, putPage } from "../../core/book"

import { bookType, type CoreCatalog } from "../../core/core-catalog"
import type { DefaultedSettingDef, SettingDef } from "../../core/def/setting"
import { fail } from "../../core/errors"
import type { ItemPage } from "../../core/placed"
import type { Book } from "../../core/schema/book"
import { settingSchema } from "../../core/settings"
import { tidyConnectors } from "./place/placed"

export type SettingsOf = "book" | "page"

// タイプが選んだ、ブックかページの設定の定義（選んだ順）
export function settingDefs(catalog: CoreCatalog, type: string, of: SettingsOf): SettingDef[] {
  return (bookType(catalog, type).settings?.[of] ?? []).map(id => catalog.settings.get(id) ?? fail("E113", { id }))
}

// 選んだ項目を、変えるときに渡す形にする（どれも書かなくてよく、null は消す。項目の id で渡す。値の形は機能台帳から組み立てた形か schema）
function settingsPatch(catalog: CoreCatalog, defs: readonly SettingDef[]): z.ZodObject {
  return z.strictObject(Object.fromEntries(defs.map(d => [d.id, settingSchema(catalog, d).nullable().optional()])))
}

// ブックかページの settings のフィールド（無ければ空）
const ownSettings = (target: object | null): Readonly<Record<string, unknown>> =>
  (target as { settings?: Record<string, unknown> } | null)?.settings ?? {}

// ブックのタイプの、ブックかページの設定の項目を変えるときに渡す形（項目を選んでいなければ null）
export function settingsPatchOf(catalog: CoreCatalog, book: Book, of: SettingsOf): z.ZodObject | null {
  const defs = settingDefs(catalog, book.type, of)
  return defs.length > 0 ? settingsPatch(catalog, defs) : null
}

// AI に見せる settings の形: 項目を選んだタイプごとの形のどれか（説明にタイプの id。except の項目は除く。ほかのアクションが変える項目）
export function settingsArgs(catalog: CoreCatalog, of: SettingsOf, except: readonly string[] = []): z.ZodType {
  const each = [...catalog.bookTypes.values()].flatMap(t => {
    const defs = settingDefs(catalog, t.id, of).filter(d => !except.includes(d.id))
    return defs.length > 0 ? [settingsPatch(catalog, defs).describe(`settings of ${t.id} books`)] : []
  })
  const [first, ...rest] = each
  return first ? (rest.length ? z.union([first, ...rest]) : first) : z.strictObject({})
}

// 設定の項目 def の値を、項目の値の形で読む関数（既定を持つ項目は必ず値があり、持たない項目は undefined がありうる）
export interface SettingReader {
  <S extends z.ZodType>(def: DefaultedSettingDef<S>): z.output<S>
  <S extends z.ZodType>(def: SettingDef<S>): z.output<S> | undefined
}

// 設定の項目 def の値: ページの値、無ければブックの値、それも無ければ定義の既定（book・page は無くてよい）。
// ブックの値は、読み込むときとアクションのあとに機能台帳のブックの形（項目の schema）で確かめてあるので、ここでは確かめ直さない
// （利用者の設定は確かめずに残すので、読むときに確かめる。core/settings.ts の userSetting）
export function settingValue<S extends z.ZodType>(
  catalog: CoreCatalog,
  book: Book | null,
  page: object | null,
  def: DefaultedSettingDef<S>,
): z.output<S>
export function settingValue<S extends z.ZodType>(
  catalog: CoreCatalog,
  book: Book | null,
  page: object | null,
  def: SettingDef<S>,
): z.output<S> | undefined
export function settingValue(catalog: CoreCatalog, book: Book | null, page: object | null, def: SettingDef): unknown {
  const known = catalog.settings.get(def.id) ?? fail("E113", { id: def.id })
  return ownSettings(page)[known.id] ?? ownSettings(book)[known.id] ?? known.default
}

// ページ page で効いている設定の値を読む関数
export function settingsAt(catalog: CoreCatalog, book: Book, page: object | null): SettingReader {
  function read<S extends z.ZodType>(def: DefaultedSettingDef<S>): z.output<S>
  function read<S extends z.ZodType>(def: SettingDef<S>): z.output<S> | undefined
  function read(def: SettingDef): unknown {
    return settingValue(catalog, book, page, def)
  }
  return read
}

// 形の置かれたページの事情: ブックのタイプと、そのページで効いている設定の値
export interface PageContext {
  type: string
  setting: SettingReader
}

// ページ page の事情（ブックのタイプと、そのページで効いている設定の値）。ブックによって変わるつなぎ口などを決めるのに渡す
export const pageContext = (catalog: CoreCatalog, book: Book, page: object | null): PageContext => ({
  type: book.type,
  setting: settingsAt(catalog, book, page),
})

// 設定を変えたあとのブック: どのページも整える（place/placed.ts の tidyConnectors）。変わったページは putPage で替える。ページを持たないブックはそのまま
export function settleBook<B extends Book>(catalog: CoreCatalog, book: B): B {
  if (!hasPages(book)) return book
  let next = book
  for (const page of book.pages as readonly ItemPage[]) {
    const tidy = tidyConnectors(catalog, page, settingsAt(catalog, book, page))
    if (tidy !== page) next = putPage(next, tidy)
  }
  return next
}
