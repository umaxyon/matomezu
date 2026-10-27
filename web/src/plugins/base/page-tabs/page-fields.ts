// タイプがページに足したフィールド（pages.fields。ツリーの根など）: base のアクション page-add・page-update が fields（フィールドの名前 → 値）で受け付ける。
// base は中身を解釈せず、タイプのフィールドの形で確かめるだけ（足したフィールドが要るかは、ブックのデータの形が確かめる）。AI には、タイプごとのフィールドを引数の形に入れて見せる（fieldsArgs）
import { z } from "zod"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"

const fieldsOfType = (catalog: CoreCatalog, type: string) => bookType(catalog, type).pages?.fields ?? {}

// タイプ type のブックに渡す形: タイプのフィールドだけを、どれも書かなくてよい形で（書いたフィールドだけを替える）。フィールドの無いタイプは null
export function fieldsPatchOf(catalog: CoreCatalog, type: string): z.ZodObject | null {
  const fields = fieldsOfType(catalog, type)
  return Object.keys(fields).length > 0
    ? z.strictObject(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])))
    : null
}

// 渡したフィールドを、タイプのフィールドの形で確かめた値（無ければ空。形に合わない・フィールドの無いタイプなら null）
export function parseFields(
  catalog: CoreCatalog,
  book: Book,
  fields: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | null {
  if (fields === undefined) return {}
  const parsed = fieldsPatchOf(catalog, book.type)?.safeParse(fields)
  return parsed?.success ? parsed.data : null
}

// AI に見せる fields の形: フィールドを足したタイプごとの形のどれか（説明にタイプの id）
export function fieldsArgs(catalog: CoreCatalog): z.ZodType {
  const each = [...catalog.bookTypes.values()].flatMap(t => {
    const patch = fieldsPatchOf(catalog, t.id)
    return patch ? [patch.describe(`page fields of ${t.id} books`)] : []
  })
  const [first, ...rest] = each
  return first ? (rest.length ? z.union([first, ...rest]) : first) : z.strictObject({})
}
