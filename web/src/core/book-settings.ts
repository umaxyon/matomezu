// ブックのタイプが足す設定の項目: ブックとページの設定を変える土台のアクション（book.update・page.update）は、名前などの共通の項目に加えて、
// ブックのタイプが宣言した項目（BookTypeSettings）を settings として受け付ける。書いた項目だけを変え、null は項目を消す（既定に戻す）。
// 変えたあとはタイプの settle で整える。AI には、タイプごとの項目を引数の形に入れて見せる（settingsArgs）
import { z } from "zod"
import type { Registry } from "./registry"
import type { Book } from "./schema/book"

export type SettingsOf = "book" | "page"

// 宣言した項目を、変えるときに渡す形にする（どれも書かなくてよく、null は消す）
export function settingsPatch(fields: z.ZodObject): z.ZodObject {
  return z.strictObject(
    Object.fromEntries(Object.entries(fields.shape).map(([k, v]) => [k, (v as z.ZodType).nullable().optional()])),
  )
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

// ブックのタイプの、ブックかページの設定の項目を変えるときに渡す形（タイプが宣言していなければ null）
export function settingsPatchOf(reg: Registry, book: Book, of: SettingsOf): z.ZodObject | null {
  const fields = reg.bookTypes.get(book.type)?.settings?.[of]
  return fields ? settingsPatch(fields) : null
}

// AI に見せる settings の形: 項目を宣言したタイプごとの形のどれか（説明にタイプの id）
export function settingsArgs(reg: Registry, of: SettingsOf): z.ZodType {
  const each = [...reg.bookTypes.values()].flatMap(t => {
    const fields = t.settings?.[of]
    return fields ? [settingsPatch(fields).describe(`settings of ${t.id} books`)] : []
  })
  const [first, ...rest] = each
  return first ? (rest.length ? z.union([first, ...rest]) : first) : z.strictObject({})
}
