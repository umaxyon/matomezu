// ブックの変化: アクションの前と後のブックを比べ、変わったフィールド・ページ・アイテムを求める（許可の段が行った後に見る）
import type { Changes, PageChange } from "./def/permission"
import type { Book } from "./schema/book"

type Fields = Readonly<Record<string, unknown>>
interface Page extends Fields {
  id: string
  items?: readonly { id: string }[]
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

// 2 つの値で違うフィールド（skip は見ないフィールド）
function changedFields(before: Fields, after: Fields, skip: string): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter(k => k !== skip && !same(before[k], after[k]))
}

// 2 つの並びで、足した・消した・変わった要素の id
function changedIds(before: readonly { id: string }[], after: readonly { id: string }[]): string[] {
  const was = new Map(before.map(x => [x.id, x]))
  const now = new Map(after.map(x => [x.id, x]))
  const ids = new Set([...was.keys(), ...now.keys()])
  return [...ids].filter(id => !same(was.get(id), now.get(id)))
}

const pagesOf = (book: Book): readonly Page[] => ("pages" in book ? (book.pages as readonly Page[]) : [])

function pageChange(id: string, before: Page | undefined, after: Page | undefined): PageChange {
  if (!before) return { id, change: "added", fields: [], items: (after?.items ?? []).map(i => i.id) }
  if (!after) return { id, change: "removed", fields: [], items: (before.items ?? []).map(i => i.id) }
  return {
    id,
    change: "changed",
    fields: changedFields(before, after, "items"),
    items: changedIds(before.items ?? [], after.items ?? []),
  }
}

export function changesOf(before: Book, after: Book | undefined): Changes {
  if (!after) return { gone: true, fields: [], pages: [] }
  const was = new Map(pagesOf(before).map(p => [p.id, p]))
  const now = new Map(pagesOf(after).map(p => [p.id, p]))
  const ids = new Set([...was.keys(), ...now.keys()])
  return {
    gone: false,
    fields: changedFields(before as Fields, after as Fields, "pages"),
    pages: [...ids].filter(id => !same(was.get(id), now.get(id))).map(id => pageChange(id, was.get(id), now.get(id))),
  }
}
