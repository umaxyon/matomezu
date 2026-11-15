// ブックの変化: アクションの前と後のブックを比べ、変わったフィールド・ページ・アイテムを求める（認可ステップが行った後に見る）
import { lineupOf, pagesOf } from "./book"
import type { Changes, PageChange } from "./def/permission"
import { sameData } from "./same"
import type { Book } from "./schema/book"

type Fields = Readonly<Record<string, unknown>>
interface Page extends Fields {
  id: string
  items?: readonly { id: string }[]
  slide?: readonly { id: string }[]
}

// 2 つの値で違うフィールド（skip は見ないフィールド）
function changedFields(before: Fields, after: Fields, skip: readonly string[]): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter(k => !skip.includes(k) && !sameData(before[k], after[k]))
}

// ページに直に置いたアイテム（items）と、ページの slide に置いたアイテム
const itemsOf = (page: Page | undefined): readonly { id: string }[] => [...(page?.items ?? []), ...(page?.slide ?? [])]

// 2 つの並びで、足した・消した・変わった要素の id
function changedIds(before: readonly { id: string }[], after: readonly { id: string }[]): string[] {
  const was = new Map(before.map(x => [x.id, x]))
  const now = new Map(after.map(x => [x.id, x]))
  const ids = new Set([...was.keys(), ...now.keys()])
  return [...ids].filter(id => !sameData(was.get(id), now.get(id)))
}

function pageChange(id: string, before: Page | undefined, after: Page | undefined): PageChange {
  if (!before) return { id, change: "added", fields: [], items: itemsOf(after).map(i => i.id) }
  if (!after) return { id, change: "removed", fields: [], items: itemsOf(before).map(i => i.id) }
  return {
    id,
    change: "changed",
    fields: changedFields(before, after, ["items", "slide"]),
    items: [...changedIds(before.items ?? [], after.items ?? []), ...changedIds(before.slide ?? [], after.slide ?? [])],
  }
}

// 並びの骨組み: 要素の id の順と、フォルダの名前・入れるタイプ・中のページの id の順（ページの中身は入れない）
const skeleton = (book: Book): unknown =>
  lineupOf(book).map(e =>
    e.kind === "page" ? e.id : { id: e.id, title: e.title, pageType: e.pageType, lineup: e.lineup.map(p => p.id) },
  )

export function changesOf(before: Book | undefined, after: Book | undefined): Changes {
  if (!after) return { gone: true, added: false, fields: [], lineup: false, pages: [] }
  if (!before)
    return {
      gone: false,
      added: true,
      fields: Object.keys(after).filter(k => k !== "lineup"),
      lineup: lineupOf(after).length > 0,
      pages: pagesOf(after).map(p => pageChange(p.id, undefined, p)),
    }
  const was = new Map(pagesOf(before).map(p => [p.id, p]))
  const now = new Map(pagesOf(after).map(p => [p.id, p]))
  const ids = new Set([...was.keys(), ...now.keys()])
  return {
    gone: false,
    added: false,
    fields: changedFields(before as Fields, after as Fields, ["lineup"]),
    lineup: !sameData(skeleton(before), skeleton(after)),
    pages: [...ids]
      .filter(id => !sameData(was.get(id), now.get(id)))
      .map(id => pageChange(id, was.get(id), now.get(id))),
  }
}
