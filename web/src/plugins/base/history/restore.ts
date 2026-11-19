// 画面の履歴の段の置き直し: 画面の履歴の段が変えたページとフォルダごとに、変えた所（フィールドごと・id の並びは id ごと・改行を含む文字列は行ごと。core/patch.ts）だけを、
// 前か後の値に置き直す。置き直す値（Patch）は画面の履歴の段だけから決まり、所ごとに反対側の値も持つ。今の表の上で行い、画面の履歴の段が書いた値のままの所だけを置き直す
// （その間にほかで変わった所は、画面の履歴の段が変えた所に重ならなければ残し、重なれば断る。無かった行を丸ごと置く値は、同じ中身の行が今在れば飛ばし、違えば断る。core/folders.ts の restoredTables）
import { z } from "zod"
import { inTrash, type Library, libraryOf, type RowPatches, restoredTables, tablesOf } from "../../../core/folders"
import type { RowChange } from "../../../core/history"
import type { Books } from "../../../core/library"
import { type ListPatch, type Patch, patchOf } from "../../../core/patch"
import type { Book } from "../../../core/schema/book"
import { kit } from "../kit"

// ブック books の表に、ページとフォルダごとの置き直す値 patches を行って組み直した一覧（変わらなかったブックは同じ値のまま。組めないブックは入らない）
function withRowPatches(books: readonly Book[], patches: RowPatches): Readonly<Record<string, Book>> | null {
  const next = restoredTables(tablesOf(books), patches)
  return next && libraryOf(next)
}

// 置き直しても何も変わらないこと（もう、置き直す側の値になっている）: 置き直す関数が返す値と、置き直しのアクションが断るときの断りの種類
export const UNCHANGED = "unchanged"
export const REVERT_UNCHANGED = kit.name("revert-unchanged")
export const DECLINED_UNCHANGED = { declined: "there is nothing to put back", kind: REVERT_UNCHANGED }
// アクションの答え result が、置き直しても何も変わらないという断りか
export const isRevertUnchanged = (result: { ok: boolean; reason?: string; kind?: string }): boolean =>
  !result.ok && result.reason === "refused" && result.kind === REVERT_UNCHANGED

export const PatchSchema: z.ZodType<Patch> = z.lazy(() => {
  const list = z.array(z.strictObject({ id: z.string().min(1), index: z.number().int(), patch: PatchSchema }))
  const ids = z.array(z.string().min(1))
  return z.union([
    z.strictObject({ set: z.unknown(), was: z.unknown().optional() }),
    z.strictObject({ absent: z.literal(true), was: z.unknown() }),
    z.strictObject({ fields: z.record(z.string(), PatchSchema) }),
    z.strictObject({ list }),
    z.strictObject({ list, order: ids, was: ids, moved: ids }),
    z.strictObject({ text: z.strictObject({ from: z.string(), to: z.string() }) }),
  ])
}) as z.ZodType<Patch>

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

// ブックの全部 all のうちのブック books を、ページとフォルダごとの置き直す値 patches で置き直した全部（変わらなかったブックは同じ値のまま）。
// books のどれかが無い・置き直す所がほかの変更とぶつかる・置き直すと組めなくなるか、books のほかのブックが変わる・ブックが増える・減るなら null
export function restoredBooks(all: Books, books: readonly string[], patches: RowPatches): Books | null {
  if (!books.every(id => all[id] !== undefined)) return null
  const next = withRowPatches(Object.values(all), patches)
  return next && onlyChanged(all, next, books) ? next : null
}

// 書庫 library のブック books を、patches で置き直した書庫（断る場合は、上の restoredBooks と同じ。books のどれかがゴミ箱かその中に在るときも断る）。
// 置き直しても何も変わらなければ UNCHANGED
export function restoredLibrary(
  library: Library,
  books: readonly string[],
  patches: RowPatches,
): Library | typeof UNCHANGED | null {
  const was = libraryOf(library)
  if (!books.every(id => was[id] !== undefined && !inTrash(library.folders, id))) return null
  const next = restoredTables(library, patches)
  if (next === library) return UNCHANGED
  return next && onlyChanged(was, libraryOf(next), books) ? next : null
}

// ブックの全部が was から next へ、増えも減りもせず、変わったのがブック books だけか
function onlyChanged(was: Books, next: Books, books: readonly string[]): boolean {
  if (Object.keys(next).length !== Object.keys(was).length) return false
  return Object.values(was).every(b => {
    const now = next[b.id]
    return now !== undefined && (now === b || books.includes(b.id))
  })
}
