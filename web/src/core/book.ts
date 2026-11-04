// ブックの操作（データを書き換えず、新しい値を返す）

import { bookSchemas, bookType, type CoreCatalog } from "./core-catalog"
import type { NewBook } from "./def/book-type"
import { fail } from "./errors"
import { freshId } from "./ids"
import { splitId } from "./names"
import type { PaperChoice } from "./paper"
import { type ItemPage, pageHolds, walkShapes } from "./placed"
import type { Book, Page } from "./schema/book"
import { type Warning, warning } from "./warnings"

export type PagedBook = Extract<Book, { pages: readonly Page[] }>

// 残しておいたブックを確かめる: このインスタンスのブックの形に合うものは books に、読めないものは warning（タイプが無い W004・形が合わない W005・
// アイテムどうしの関係の決まりを守らない W006）にする。読めるが、機能台帳に無いアイテムや設定の項目を持つブックは partial に warning W007 を足す。
// 残したブックは外から来る値なので、形を確かめてから使う。読めないブックのデータには手を付けない
export function checkBooks(
  catalog: CoreCatalog,
  saved: readonly unknown[],
): { books: Book[]; warnings: Warning[]; partial: Warning[] } {
  const books: Book[] = []
  const warnings: Warning[] = []
  const partial: Warning[] = []
  for (const b of saved) {
    const raw = (typeof b === "object" && b !== null ? b : {}) as { id?: unknown; title?: unknown; type?: unknown }
    const type = typeof raw.type === "string" ? raw.type : ""
    const params = { book: String(raw.id ?? ""), title: typeof raw.title === "string" ? raw.title : "", type }
    const plugin = splitId(type).owner ?? ""
    if (!catalog.bookTypes.has(type)) {
      warnings.push(warning("W004", plugin, params))
      continue
    }
    const parsed = catalog.bookSchema.safeParse(b)
    if (!parsed.success) warnings.push(warning("W005", plugin, params))
    else if (!holds(catalog, parsed.data as Book)) warnings.push(warning("W006", plugin, params))
    else {
      const book = parsed.data as Book
      books.push(book)
      const missing = missingIn(catalog, book)
      const [first] = missing
      if (first) partial.push(warning("W007", splitId(first).owner ?? "", { ...params, missing: missing.join(", ") }))
    }
  }
  return { books, warnings, partial }
}

// ブックが持つ、機能台帳に無いアイテム（どの深さの子の形も）と設定の項目の id（重ねずに、見つけた順）
function missingIn(catalog: CoreCatalog, book: Book): string[] {
  const found = new Set<string>()
  const settingsOf = (o: object) => Object.keys((o as { settings?: object }).settings ?? {})
  for (const k of settingsOf(book)) if (!catalog.settings.has(k)) found.add(k)
  for (const page of "pages" in book ? (book.pages as readonly ItemPage[]) : []) {
    for (const k of settingsOf(page)) if (!catalog.settings.has(k)) found.add(k)
    for (const i of page.items ?? []) if (!catalog.items.has(i.item)) found.add(i.item)
    for (const { shape } of walkShapes(page)) if (!catalog.items.has(shape.item)) found.add(shape.item)
  }
  return [...found]
}

// 残しておいたブックのうち、読めるものだけ（checkBooks の books）
export const restoreBooks = (catalog: CoreCatalog, saved: readonly unknown[]): Book[] =>
  checkBooks(catalog, saved).books

// 表にある 1 冊だけのタイプのブック（インスタンスがいつも持つもの。土台のフィールドの既定を埋めた形）
export function singleBooks(catalog: CoreCatalog): Book[] {
  return catalog.parts.bookTypes.flatMap(t => (t.single ? [bookSchemas(catalog, t.id).book.parse(t.book) as Book] : []))
}

// ブック book の、同じ id のページを page に替える（無ければ、at があればその並びの所に足す。並びより後ろなら末尾）。page に置いたアイテムが
// ブックのタイプの選んだものかは型では確かめられないので、渡されたブックの型のまま返すと言い張る（形は perform がアクションの後に機能台帳のブックの形で確かめ直す）
export function putPage<B extends PagedBook>(book: B, page: ItemPage, at?: number): B {
  const pages: readonly ItemPage[] = book.pages
  if (at === undefined || pages.some(p => p.id === page.id))
    return { ...book, pages: pages.map(p => (p.id === page.id ? page : p)) } as B
  return { ...book, pages: [...pages.slice(0, at), page, ...pages.slice(at)] } as B
}

// ブック book から、id が page のページを除く（型は putPage と同じく渡されたブックの型）
export function removePage<B extends PagedBook>(book: B, page: string): B {
  return { ...book, pages: book.pages.filter((p: ItemPage) => p.id !== page) } as B
}

export function hasPages(book: Book): book is PagedBook {
  return "pages" in book
}

// ページを持つブックなら、そのブック（無いかページを持たなければ undefined）
export const pagedOf = (book: Book | null | undefined): PagedBook | undefined =>
  book && hasPages(book) ? book : undefined

// ブックのページの並び（ページを持たなければ空）
export const pagesOf = (book: Book): readonly Page[] => pagedOf(book)?.pages ?? []

// 表の、何冊も作れるタイプの id（表の順）
export function creatableTypes(catalog: CoreCatalog): string[] {
  return catalog.parts.bookTypes.filter(t => !t.single).map(t => t.id)
}

// そのタイプの空のブック。何冊も作れるタイプでなければ error
export function createBook(catalog: CoreCatalog, type: string, init: NewBook): Book {
  const def = bookType(catalog, type)
  if (def.single) return fail("E104", { type })
  return def.create(init) as Book
}

// ブックで使えるアイテム（タイプの候補。データに置ける・引けるのはこの中だけ）
export function bookItems(catalog: CoreCatalog, book: Pick<Book, "type">): readonly string[] {
  return bookType(catalog, book.type).items.allowed
}

// ページを末尾に足す。id は newId から振る（ブックのほかのページと重ならない）
export function addPage<B extends PagedBook>(
  book: B,
  init: { title: string; grows?: Page["grows"] } & PaperChoice,
  newId: () => string,
): { book: B; page: Page } {
  const page = {
    id: freshId(
      newId,
      book.pages.map(p => p.id),
    ),
    ...init,
  }
  return { book: { ...book, pages: [...book.pages, page] }, page }
}

// ブックかページの設定の項目（settings のフィールド）を変えた値: patch（項目の id → 値）の null の項目は消し、undefined の項目は変えない。
// 項目が 1 つも無くなれば settings のフィールドも消す
export function withSettings<T extends object>(target: T, patch: Readonly<Record<string, unknown>>): T {
  const settings: Record<string, unknown> = { ...(target as { settings?: Record<string, unknown> }).settings }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete settings[k]
    else if (v !== undefined) settings[k] = v
  }
  const { settings: _old, ...rest } = target as T & { settings?: unknown }
  return (Object.keys(settings).length > 0 ? { ...rest, settings } : rest) as T
}

// ブックが、データの形の外の決まり（アイテムどうしの関係）を守っているか: タイプの決まりと、どのページもつなぐものの定義の決まり
export function holds(catalog: CoreCatalog, book: Book): boolean {
  if (!(bookType(catalog, book.type).holds?.(book, catalog) ?? true)) return false
  return !("pages" in book) || (book.pages as readonly ItemPage[]).every(p => pageHolds(catalog, p))
}
