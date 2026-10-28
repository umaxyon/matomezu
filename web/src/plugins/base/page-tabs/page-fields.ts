// タイプがページに足したフィールド（pages.fields。ツリーの根など）: base のアクション page-add・page-update が fields（フィールドの名前 → 値）で受け付ける。
// 受け方はタイプが決められる（pageFieldsInput。作るとき・直すときごとに、受ける形と、ページへの書き方）。決めていなければ、base は中身を解釈せず、
// タイプのフィールドの形で確かめて、書いたフィールドを丸ごと替える。書いたあとのページがタイプの形に合うかは、ブックのデータの形が確かめる。
// AI には、タイプごとの受ける形を引数の形に入れて見せる（fieldsArgs）
import { z } from "zod"
import type { PagedBook } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Page } from "../../../core/schema/book"
import { contentIdMaker } from "../utils/ids"

export type FieldsOf = "add" | "update"

// タイプの受け方の 1 つ: 受ける形 args と、受けた値 input をページ page に書いて、書き足すフィールドを返す書き方 write（断るなら null）。
// 書けるのはタイプがページに足したフィールドだけ（ほかのフィールドを返せば断る）。新しい id は makeId で振る（ブックの全部のページの中身と重ならない）。
// result は、アクションの結果の fields に入れて返す物（振った id など）。形と書き方の型を合わせるには pageFieldsWay で作る
export interface PageFieldsWay<A extends z.ZodObject = z.ZodObject> {
  args: A
  write(
    page: Readonly<Record<string, unknown>>,
    input: z.infer<A>,
    makeId: () => string,
  ): { fields: Readonly<Record<string, unknown>>; result?: unknown } | null
}

// 受ける形から書き方の input の型を決めて、受け方を作る
export const pageFieldsWay = <A extends z.ZodObject>(way: PageFieldsWay<A>): PageFieldsWay =>
  way as unknown as PageFieldsWay

// ページのフィールドの受け方（定義オブジェクトの拡張ポイントに書き足す。add は page-add、update は page-update。無いものは base の受け方）
declare module "../../../core/catalog" {
  interface BookTypeExtras {
    pageFieldsInput?: { add?: PageFieldsWay; update?: PageFieldsWay }
  }
}

// base の受け方の形: タイプのフィールドだけを、どれも書かなくてよい形で（フィールドの無いタイプは null）
function defaultArgs(catalog: CoreCatalog, type: string): z.ZodObject | null {
  const fields = bookType(catalog, type).pages?.fields ?? {}
  return Object.keys(fields).length > 0
    ? z.strictObject(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])))
    : null
}

const wayOf = (catalog: CoreCatalog, type: string, of: FieldsOf) => bookType(catalog, type).pageFieldsInput?.[of]

// タイプ type のブックの、作るとき・直すときに受ける形（フィールドの無いタイプは null）
export function fieldsArgsOf(catalog: CoreCatalog, type: string, of: FieldsOf): z.ZodObject | null {
  return wayOf(catalog, type, of)?.args ?? defaultArgs(catalog, type)
}

// 渡したフィールド fields を受けて書いたページと、受け方の返した結果（形に合わない・フィールドの無いタイプ・受け方が断れば null）
export function writeFields(
  catalog: CoreCatalog,
  book: PagedBook,
  page: Page,
  fields: Readonly<Record<string, unknown>> | undefined,
  of: FieldsOf,
  newId: () => string,
): { page: Page; result?: unknown } | null {
  if (fields === undefined) return { page }
  const parsed = fieldsArgsOf(catalog, book.type, of)?.safeParse(fields)
  if (!parsed?.success) return null
  const way = wayOf(catalog, book.type, of)
  if (!way) return { page: { ...page, ...parsed.data } }
  const written = way.write(page as Readonly<Record<string, unknown>>, parsed.data, contentIdMaker(book, newId))
  const own = bookType(catalog, book.type).pages?.fields ?? {}
  if (!written || !Object.keys(written.fields).every(k => k in own)) return null
  return { page: { ...page, ...written.fields }, result: written.result }
}

// AI に見せる fields の形: フィールドを足したタイプごとの、作るとき・直すときに受ける形のどれか（説明にタイプの id）
export function fieldsArgs(catalog: CoreCatalog, of: FieldsOf): z.ZodType {
  const each = [...catalog.bookTypes.values()].flatMap(t => {
    const args = fieldsArgsOf(catalog, t.id, of)
    return args ? [args.describe(`page fields of ${t.id} books`)] : []
  })
  const [first, ...rest] = each
  return first ? (rest.length ? z.union([first, ...rest]) : first) : z.strictObject({})
}
