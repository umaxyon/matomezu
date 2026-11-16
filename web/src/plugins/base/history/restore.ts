// 画面の履歴の段の置き直し: 画面の履歴の段が変えた所（フィールドごと・id の並びは id ごと・改行を含む文字列は行ごと。core/patch.ts）だけを、前か後の値に置き直す。
// 置き直す値（Patch）は画面の履歴の段だけから決まり、今のブックの上で行う（その間にほかで変わった所は、画面の履歴の段が変えた所に重なれば上書きし、重ならなければ残す）
import { z } from "zod"
import { applyPatch, type ListPatch, type Patch } from "../../../core/patch"
import type { Book } from "../../../core/schema/book"

export const PatchSchema: z.ZodType<Patch> = z.lazy(() =>
  z.union([
    z.strictObject({ set: z.unknown() }),
    z.strictObject({ absent: z.literal(true) }),
    z.strictObject({ fields: z.record(z.string(), PatchSchema) }),
    z.strictObject({
      list: z.array(z.strictObject({ id: z.string().min(1), index: z.number().int(), patch: PatchSchema })),
      order: z.array(z.string().min(1)).optional(),
    }),
    z.strictObject({ text: z.strictObject({ from: z.string(), to: z.string() }) }),
  ]),
) as z.ZodType<Patch>

// Patch が置き直すフィールド key の Patch
const fieldOf = (p: Patch, key: string): Patch | undefined => ("fields" in p ? p.fields[key] : undefined)
const listOf = (p: Patch | undefined): readonly ListPatch[] => (p && "list" in p ? p.list : [])

// 置き直す並びの要素（ブックの並び lineup の要素と、バインダの中のページ）と、その中で置き直す最上位のアイテム（要素を丸ごと置き直すなら undefined）。
// 中の並び（lineup）のフィールドを置き直す要素はバインダ（ページは lineup という名前のフィールドを持てない。台帳アセンブルの E030）なので、その中のページを返す。
// ほかの要素は、ページかバインダかを Patch からは見分けられない（名前だけの置き直し・丸ごと足す・消す）ので、そのまま返す。
// バインダの id が混ざるので、ページとして使う側がブックで確かめる（認可の所は、無いページを名指せばページのタイプでは決まらず、行った後の確かめが見る）
export function restoredEntries(p: Patch): { id: string; gone: boolean; items: readonly string[] | undefined }[] {
  return listOf(fieldOf(p, "lineup")).flatMap(q => {
    const inner = "fields" in q.patch ? fieldOf(q.patch, "lineup") : undefined
    return inner ? listOf(inner).map(restored) : [restored(q)]
  })
}

// 並びの要素 1 つの置き直し
function restored(q: ListPatch): { id: string; gone: boolean; items: readonly string[] | undefined } {
  const items = "fields" in q.patch ? fieldOf(q.patch, "items") : undefined
  return {
    id: q.id,
    gone: "absent" in q.patch,
    items: "fields" in q.patch ? listOf(items).map(i => i.id) : undefined,
  }
}

// 今のブック book に、置き直す値を行う
export const applyRestore = (book: Book, p: Patch): Book => applyPatch(book, p) as Book
