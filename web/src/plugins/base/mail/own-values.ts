// 物の自分の値: 変更提案郵便が、送った時と反映する時の当たる物を比べるのに使う
import { frameOf, pagesOf } from "../../../core/book"
import { objectsById } from "../../../core/ids"
import { sameData } from "../../../core/same"
import type { Book } from "../../../core/schema/book"

// 値の中の、id を持つ物ごとの、自分の値（id → 値。中の id を持つ物は、その id だけにした値。中の物が変わっても自分の値は変わらず、
// 中の物を足した・外した・並べ替えたなら変わる）
export function ownValues(value: unknown): Map<string, unknown> {
  const all = new Map<string, unknown>()
  for (const [id, obj] of objectsById(value)) all.set(id, ownOf(obj, true))
  return all
}

function ownOf(value: unknown, top: boolean): unknown {
  if (Array.isArray(value)) return value.map(v => ownOf(v, false))
  if (typeof value !== "object" || value === null) return value
  const { id } = value as { id?: unknown }
  if (!top && typeof id === "string") return { id }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ownOf(v, false)]))
}

// ブック book の、id を持つ物ごとの自分の値を、その物のある所ごとにまとめた表（所の id → 物の id → 値）。
// ページの中の物とページそのものは、そのページの id の所に、バインダとブックそのものは、ブックの id の所に入れる（物の id は、ページの中でだけ重ならない）
export function ownValuesIn(book: Book): Map<string, Map<string, unknown>> {
  const all = new Map<string, Map<string, unknown>>()
  const pages = pagesOf(book)
  for (const page of pages) all.set(page.id, ownValues(page))
  const own = ownValues(frameOf(book))
  for (const page of pages) own.delete(page.id)
  all.set(book.id, own)
  return all
}

// ブック before にある、id を持つ物のうち、after で自分の値（ownValuesIn）が変わったか無くなった物（その物のある所 within と、物の id）
export function ownChangedIn(before: Book, after: Book): { within: string; id: string }[] {
  const now = ownValuesIn(after)
  return [...ownValuesIn(before)].flatMap(([within, values]) =>
    [...values]
      .filter(([id, v]) => !now.get(within)?.has(id) || !sameData(v, now.get(within)?.get(id)))
      .map(([id]) => ({ within, id })),
  )
}
