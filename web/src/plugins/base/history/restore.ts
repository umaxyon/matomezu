// 画面の履歴の段の置き直し: 画面の履歴の段が変えた所（ブックのフィールド・ページ・最上位のアイテム）だけを、前か後の値に置き直す。置き直す値（RestoreArgs）は画面の履歴の段だけから決まり、
// 今のブックの上で行う（その間にほかで変わった所は、画面の履歴の段が変えた所に重なれば上書きし、重ならなければ残す）
import { hasPages, type PagedBook, pagesOf, putPage, removePage } from "../../../core/book"
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
  | { id: string; fields: FieldsPatch; items: ItemPatch[]; order?: string[] }
// order は並びの置き直し: 並びに今ある物のうち、ここに挙げた id の物の場所に、挙げた順に並べ直す（違いが並び順だけのときも、置き直せるように）
export interface RestoreArgs {
  fields: FieldsPatch
  pages: PagePatch[]
  order?: string[]
}

interface Page extends Fields {
  id: string
  items?: readonly ({ id: string } & Fields)[]
}

// 置き直しは、ページとアイテムをどのフィールドも同じに扱う（タイプごとのページの形は見ない）
const pagesIn = (book: Book): readonly Page[] => pagesOf(book)

function fieldsPatch(to: Fields, fields: readonly string[]): FieldsPatch {
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  for (const f of fields) {
    if (f in to) set[f] = to[f]
    else unset.push(f)
  }
  return { set, unset }
}

// 並び from を並び to の順に直す id の順（両方にある物の相対順が同じなら無し）
export function orderPatch(from: readonly { id: string }[], to: readonly { id: string }[]): string[] | undefined {
  const inFrom = new Set(from.map(x => x.id))
  const inTo = new Set(to.map(x => x.id))
  const a = from.filter(x => inTo.has(x.id)).map(x => x.id)
  const b = to.filter(x => inFrom.has(x.id)).map(x => x.id)
  return a.some((id, i) => id !== b[i]) ? b : undefined
}

// ブック from を、to と違う所だけ to に置き直す値
export function restoreArgs(from: Book, to: Book): RestoreArgs {
  const changes = changesOf(from, to)
  const toPages = pagesIn(to)
  const pages = changes.pages.map((c): PagePatch => {
    const index = toPages.findIndex(p => p.id === c.id)
    const page = toPages[index]
    if (c.change !== "changed" || !page) return { id: c.id, index, page: page ?? null }
    const items = page.items ?? []
    const order = orderPatch(pagesIn(from).find(p => p.id === c.id)?.items ?? [], items)
    return {
      id: c.id,
      ...(order ? { order } : {}),
      fields: fieldsPatch(page, c.fields),
      items: c.items.map(id => {
        const i = items.findIndex(x => x.id === id)
        return { id, index: i, item: items[i] ?? null }
      }),
    }
  })
  const order = orderPatch(pagesIn(from), toPages)
  return { fields: fieldsPatch(to as Fields, changes.fields), pages, ...(order ? { order } : {}) }
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

// 並び list の、order に挙げた id の物（list に無い id は飛ばす）の場所に、その物を order の順に並べ直す。ほかの物は動かさない
function reorder<T extends { id: string }>(list: readonly T[], order: readonly string[]): T[] {
  const byId = new Map(list.map(x => [x.id, x]))
  const moved = order.flatMap(id => byId.get(id) ?? [])
  const slots = new Set(moved.map(x => x.id))
  let at = 0
  return list.map(x => (slots.has(x.id) ? (moved[at++] as T) : x))
}

function applyPage(page: Page, patch: Extract<PagePatch, { fields: FieldsPatch }>): Page {
  const items = patch.items.reduce(
    (list, p) => put(list, p.id, p.index, p.item as ({ id: string } & Fields) | null),
    page.items ?? [],
  )
  const ordered = patch.order ? reorder(items, patch.order) : items
  return { ...applyFields(page, patch.fields), ...(ordered.length > 0 || page.items ? { items: ordered } : {}) }
}

// 今のブック book に、置き直す値を行う。フィールドとアイテムだけを置き直すページが無くなっていれば、そのページは飛ばす
export function applyRestore(book: Book, args: RestoreArgs): Book {
  const next = applyFields(book as Fields, args.fields) as Book
  if (!hasPages(next)) return next
  const placed = args.pages.reduce((b: PagedBook, p) => {
    if ("page" in p) return p.page === null ? removePage(b, p.id) : putPage(b, p.page as ItemPage, Math.max(0, p.index))
    const page = (b.pages as readonly Page[]).find(x => x.id === p.id)
    return page ? putPage(b, applyPage(page, p) as ItemPage) : b
  }, next)
  if (!args.order) return placed
  // 先頭から順に、並べ直した位置へ置き直す（先頭の i 枚はもう並び終えているので、i の所に足せば並びになる）
  return reorder<ItemPage>(placed.pages, args.order).reduce(
    (b: PagedBook, p, i) => putPage(removePage(b, p.id), p, i),
    placed,
  )
}
