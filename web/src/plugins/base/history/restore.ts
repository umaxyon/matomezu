// 画面の履歴の段の置き直し: 画面の履歴の段が変えた所（ブックのフィールド・ページ・最上位のアイテム）だけを、前か後の値に置き直す。置き直す値（RestoreArgs）は画面の履歴の段だけから決まり、
// 今のブックの上で行う（その間にほかで変わった所は、画面の履歴の段が変えた所に重なれば上書きし、重ならなければ残す）
import { hasPages, type PagedBook, putPage, removePage } from "../../../core/book"
import { changesOf } from "../../../core/changes"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"

type Fields = Readonly<Record<string, unknown>>
// フィールドの置き直し: set は値を入れ、unset は外す
export interface FieldsPatch {
  set: Fields
  unset: string[]
}
// アイテムの置き直し: item が null なら外し、あれば同じ id の物と入れ替える（無ければ index の所に足す）
export interface ItemPatch {
  id: string
  index: number
  item: Fields | null
}
// ページの置き直し: page があればページを丸ごと（null なら外す）、無ければページのフィールドとアイテムだけ
export type PagePatch =
  | { id: string; index: number; page: Fields | null }
  | { id: string; fields: FieldsPatch; items: ItemPatch[] }
export interface RestoreArgs {
  fields: FieldsPatch
  pages: PagePatch[]
}

interface Page extends Fields {
  id: string
  items?: readonly ({ id: string } & Fields)[]
}
const pagesOf = (book: Book): readonly Page[] => ("pages" in book ? (book.pages as readonly Page[]) : [])

function fieldsPatch(to: Fields, fields: readonly string[]): FieldsPatch {
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  for (const f of fields) {
    if (f in to) set[f] = to[f]
    else unset.push(f)
  }
  return { set, unset }
}

// ブック from を、to と違う所だけ to に置き直す値
export function restoreArgs(from: Book, to: Book): RestoreArgs {
  const changes = changesOf(from, to)
  const toPages = pagesOf(to)
  const pages = changes.pages.map((c): PagePatch => {
    const index = toPages.findIndex(p => p.id === c.id)
    const page = toPages[index]
    if (c.change !== "changed" || !page) return { id: c.id, index, page: page ?? null }
    const items = page.items ?? []
    return {
      id: c.id,
      fields: fieldsPatch(page, c.fields),
      items: c.items.map(id => {
        const i = items.findIndex(x => x.id === id)
        return { id, index: i, item: items[i] ?? null }
      }),
    }
  })
  return { fields: fieldsPatch(to as Fields, changes.fields), pages }
}

function applyFields<T extends Fields>(value: T, patch: FieldsPatch): T {
  const next: Record<string, unknown> = { ...value, ...patch.set }
  for (const f of patch.unset) delete next[f]
  return next as T
}

// 並び list の同じ id の物を value と入れ替える（value が null なら外す。無ければ index の所、並びより後ろなら末尾に足す）
function put<T extends { id: string }>(list: readonly T[], id: string, index: number, value: T | null): T[] {
  const rest = list.filter(x => x.id !== id)
  if (value === null) return rest
  const at = list.findIndex(x => x.id === id)
  if (at >= 0) return list.map(x => (x.id === id ? value : x))
  return [...rest.slice(0, index), value, ...rest.slice(index)]
}

function applyPage(page: Page, patch: Extract<PagePatch, { fields: FieldsPatch }>): Page {
  const items = patch.items.reduce(
    (list, p) => put(list, p.id, p.index, p.item as ({ id: string } & Fields) | null),
    page.items ?? [],
  )
  return { ...applyFields(page, patch.fields), ...(items.length > 0 || page.items ? { items } : {}) }
}

// 今のブック book に、置き直す値を行う。フィールドとアイテムだけを置き直すページが無くなっていれば、そのページは飛ばす
export function applyRestore(book: Book, args: RestoreArgs): Book {
  const next = applyFields(book as Fields, args.fields) as Book
  if (!hasPages(next)) return next
  return args.pages.reduce((b: PagedBook, p) => {
    if ("page" in p) return p.page === null ? removePage(b, p.id) : putPage(b, p.page as ItemPage, Math.max(0, p.index))
    const page = (b.pages as readonly Page[]).find(x => x.id === p.id)
    return page ? putPage(b, applyPage(page, p) as ItemPage) : b
  }, next)
}
