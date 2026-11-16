// 画面の履歴の段の置き直し: 画面の履歴の段が変えたページとフォルダごとに、変えた所（フィールドごと・id の並びは id ごと・改行を含む文字列は行ごと。core/patch.ts）だけを、
// 前か後の値に置き直す。置き直す値（Patch）は画面の履歴の段だけから決まり、今の表の上で行う（その間にほかで変わった所は、画面の履歴の段が変えた所に重なれば上書きし、
// 重ならなければ残す。core/restore.ts）
import { z } from "zod"
import type { ListPatch, Patch } from "../../../core/patch"

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
