// ブックとページの設定の項目: ブックのタイプが設定の定義（core/def/setting.ts）を id で選び、登録表がその欄をブックとページの形に足す。
// 変える base のアクション（book.update・page.update）は、名前などの共通の項目に加えて、選んだ項目を settings として受け付ける。書いた項目だけを変え、null は項目を消す（既定に戻す）。
// 変えたあとはページを整える（settleBook）。値は ページ → ブック → 定義の既定 の順に、最初に値のある所で決まる（settingValue）。
// AI には、タイプごとの項目を引数の形に入れて見せる（settingsArgs）
import { z } from "zod"
import { bookType, type CoreCatalog } from "./core-catalog"
import type { SettingDef } from "./def/setting"
import { fail } from "./errors"
import { type ItemPage, tidyPage } from "./placed"
import type { Book } from "./schema/book"

export type SettingsOf = "book" | "page"

// タイプが選んだ、ブックかページの設定の定義（選んだ順）
export function settingDefs(reg: CoreCatalog, type: string, of: SettingsOf): SettingDef[] {
  return (bookType(reg, type).settings?.[of] ?? []).map(id => reg.settings.get(id) ?? fail("E113", { id }))
}

// 設定の定義の欄を、データの形の欄にする（どれも書かなくてよい）
export const settingFields = (defs: readonly SettingDef[]): Record<string, z.ZodType> =>
  Object.fromEntries(defs.map(d => [d.field, d.schema.optional()]))

// 選んだ項目を、変えるときに渡す形にする（どれも書かなくてよく、null は消す。欄の名前で渡す）
function settingsPatch(defs: readonly SettingDef[]): z.ZodObject {
  return z.strictObject(Object.fromEntries(defs.map(d => [d.field, d.schema.nullable().optional()])))
}

// 項目を変えた値（null の項目は消す）
export function withSettings<T extends object>(target: T, patch: Readonly<Record<string, unknown>>): T {
  const next: Record<string, unknown> = { ...(target as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]
    else if (v !== undefined) next[k] = v
  }
  return next as T
}

// ブックのタイプの、ブックかページの設定の項目を変えるときに渡す形（項目を選んでいなければ null）
export function settingsPatchOf(reg: CoreCatalog, book: Book, of: SettingsOf): z.ZodObject | null {
  const defs = settingDefs(reg, book.type, of)
  return defs.length > 0 ? settingsPatch(defs) : null
}

// AI に見せる settings の形: 項目を選んだタイプごとの形のどれか（説明にタイプの id）
export function settingsArgs(reg: CoreCatalog, of: SettingsOf): z.ZodType {
  const each = [...reg.bookTypes.values()].flatMap(t => {
    const defs = settingDefs(reg, t.id, of)
    return defs.length > 0 ? [settingsPatch(defs).describe(`settings of ${t.id} books`)] : []
  })
  const [first, ...rest] = each
  return first ? (rest.length ? z.union([first, ...rest]) : first) : z.strictObject({})
}

// 設定 id の値: ページの値、無ければブックの値、それも無ければ定義の既定（page は無くてよい）
export function settingValue(reg: CoreCatalog, book: Book, page: object | null, id: string): unknown {
  const def = reg.settings.get(id) ?? fail("E113", { id })
  const own = (at: object | null) => (at as Record<string, unknown> | null)?.[def.field]
  return own(page) ?? own(book) ?? def.default
}

// ページ page で効いている設定の値を読む関数
export const settingsAt =
  (reg: CoreCatalog, book: Book, page: object | null) =>
  (id: string): unknown =>
    settingValue(reg, book, page, id)

// 設定を変えたあとのブック: どのページも整える（core/placed.ts の tidyPage）。ページを持たないブックはそのまま
export function settleBook<B extends Book>(reg: CoreCatalog, book: B): B {
  if (!("pages" in book)) return book
  const pages = (book.pages as readonly ItemPage[]).map(p => tidyPage(reg, p, settingsAt(reg, book, p)))
  return pages.every((p, i) => p === book.pages[i]) ? book : { ...book, pages }
}
