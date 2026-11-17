// 画面の履歴の段の置き直し: 画面の履歴の段が変えたページとフォルダごとに、変えた所（フィールドごと・id の並びは id ごと・改行を含む文字列は行ごと。core/patch.ts）だけを、
// 前か後の値に置き直す。置き直す値（Patch）は画面の履歴の段だけから決まり、今の表の上で行う（その間にほかで変わった所は、画面の履歴の段が変えた所に重なれば上書きし、
// 重ならなければ残す。core/restore.ts）
import { z } from "zod"
import { type RowPatches, withRowPatches } from "../../../core/folders"
import type { RowChange } from "../../../core/history"
import type { Library } from "../../../core/library"
import { type ListPatch, type Patch, patchOf } from "../../../core/patch"

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

// 置き直しの引数: 画面の履歴の段が変えた物を持つブックの id（books）と、ページとフォルダごとの置き直す値
export const RevertArgs = z.strictObject({
  books: z.array(z.string().min(1)).min(1),
  pages: z.record(z.string(), PatchSchema),
  folders: z.record(z.string(), PatchSchema),
})
export type RevertArgs = z.output<typeof RevertArgs>

const listOf = (p: Patch | undefined): readonly ListPatch[] => (p && "list" in p ? p.list : [])

// 置き直すページと、その中で置き直す最上位のアイテム（ページを丸ごと足す・無くすなら undefined）
export function restoredPages(pages: RevertArgs["pages"]): { id: string; items: readonly string[] | undefined }[] {
  return Object.entries(pages).map(([id, p]) => ({
    id,
    items: "fields" in p ? listOf(p.fields.items).map(i => i.id) : undefined,
  }))
}

// 変わる前後の表 rows を、to の側（"before" なら前、"after" なら後）へ置き直す値（どちらの側も同じ物は入れない）
export function patchesToward<T>(
  rows: Readonly<Record<string, RowChange<T>>>,
  to: "before" | "after",
): Record<string, Patch> {
  const from = to === "before" ? "after" : "before"
  const value = (v: T | "none") => (v === "none" ? undefined : v)
  const out: Record<string, Patch> = {}
  for (const [id, row] of Object.entries(rows)) {
    const p = patchOf(value(row[from]), value(row[to]))
    if (p) out[id] = p
  }
  return out
}

// 一覧 library のブック books を、ページとフォルダごとの置き直す値 patches で置き直した一覧（変わらなかったブックは同じ値のまま）。
// books のどれかが無い・ゴミ箱に在る・置き直すと組めなくなるか、books のほかのブックが変わる・ブックが増える・減るなら null
export function restoredLibrary(library: Library, books: readonly string[], patches: RowPatches): Library | null {
  if (books.some(id => library[id] === undefined || library[id]?.trashed !== undefined)) return null
  const next = withRowPatches(Object.values(library), patches)
  if (Object.keys(next).length !== Object.keys(library).length) return null
  for (const was of Object.values(library)) {
    const now = next[was.id]
    if (!now || (now !== was && !books.includes(was.id))) return null
  }
  return next
}
