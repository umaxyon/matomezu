// ブックの操作（データを書き換えず、新しい値を返す）

import { bookSchemas, bookType, type CoreCatalog } from "./core-catalog"
import type { NewBook } from "./def/book-type"
import { ORIENTATIONS, type Orientation } from "./def/paper"
import { fail } from "./errors"
import type { Lang } from "./i18n/i18n"
import { translate } from "./i18n/i18n"
import { freshId } from "./ids"
import { splitId } from "./names"
import { type Notice, notice } from "./notices"
import type { PaperChoice, PaperRule } from "./paper"
import { actionsOf, holds } from "./perform"
import type { ItemPage } from "./placed"
import type { Book, Page } from "./schema/book"

export type PagedBook = Extract<Book, { pages: Page[] }>

// 残しておいたブックを確かめる: このインスタンスのブックの形に合うものは books に、読めないものは注意（タイプが無い N004・形が合わない N005・
// アイテムどうしの関係の決まりを守らない N006）にする。残したブックは外から来る値なので、形を確かめてから使う。読めないブックのデータには手を付けない
export function checkBooks(catalog: CoreCatalog, saved: readonly unknown[]): { books: Book[]; notices: Notice[] } {
  const books: Book[] = []
  const notices: Notice[] = []
  for (const b of saved) {
    const raw = (typeof b === "object" && b !== null ? b : {}) as { id?: unknown; title?: unknown; type?: unknown }
    const type = typeof raw.type === "string" ? raw.type : ""
    const params = { book: String(raw.id ?? ""), title: typeof raw.title === "string" ? raw.title : "", type }
    const plugin = splitId(type).owner ?? ""
    if (!catalog.bookTypes.has(type)) {
      notices.push(notice("N004", plugin, params))
      continue
    }
    const parsed = catalog.bookSchema.safeParse(b)
    if (!parsed.success) notices.push(notice("N005", plugin, params))
    else if (!holds(catalog, parsed.data as Book)) notices.push(notice("N006", plugin, params))
    else books.push(parsed.data as Book)
  }
  return { books, notices }
}

// 残しておいたブックのうち、読めるものだけ（checkBooks の books）
export const restoreBooks = (catalog: CoreCatalog, saved: readonly unknown[]): Book[] =>
  checkBooks(catalog, saved).books

// 表にある 1 冊だけのタイプのブック（インスタンスがいつも持つもの。土台の欄の既定を埋めた形）
export function singleBooks(catalog: CoreCatalog): Book[] {
  return catalog.parts.bookTypes.flatMap(t => (t.single ? [bookSchemas(catalog, t.id).book.parse(t.book) as Book] : []))
}

// ブック book の、同じ id のページを page に替える。page に置いたアイテムがブックのタイプの選んだものかは型では確かめられないので、
// 渡されたブックの型のまま返すと言い張る（形は perform がアクションの後に機能台帳のブックの形で確かめ直す）
export function putPage<B extends PagedBook>(book: B, page: ItemPage): B {
  return { ...book, pages: book.pages.map((p: ItemPage) => (p.id === page.id ? page : p)) } as B
}

export function hasPages(book: Book): book is PagedBook {
  return "pages" in book
}

// ページを持つブックなら、そのブック（無いかページを持たなければ undefined）
export const pagedOf = (book: Book | null | undefined): PagedBook | undefined =>
  book && hasPages(book) ? book : undefined

// 表の、何冊も作れるタイプの id（表の順）
export function creatableTypes(catalog: CoreCatalog): string[] {
  return catalog.parts.bookTypes.filter(t => !t.single).map(t => t.id)
}

// そのタイプの空のブック。何冊も作れるタイプでなければ誤り
export function createBook(catalog: CoreCatalog, type: string, init: NewBook): Book {
  const def = bookType(catalog, type)
  if (def.single) return fail("E104", { type })
  return def.create(init) as Book
}

// 画面に出すブックの名前。題名を持たないか空のブックは、タイプの名前で呼ぶ
export function bookTitle(catalog: CoreCatalog, book: Book, lang: Lang): string {
  return "title" in book && book.title.trim() !== ""
    ? book.title
    : translate(catalog.messages, lang, bookType(catalog, book.type).title)
}

function pagesRule(catalog: CoreCatalog, book: PagedBook) {
  const rule = bookType(catalog, book.type).pages
  if (!rule) return fail("E103", { type: book.type })
  return rule
}

// 次のページに選べる紙と向き。1 冊の紙をそろえる規定では、最初のページの紙と向きだけ
export interface PaperOptions {
  papers: readonly string[]
  orientations: readonly Orientation[]
}

// 規定の下で、次のページに選べる紙と向き
export function choosablePapers(rule: PaperRule, pages: readonly Page[]): PaperOptions {
  const first = pages[0]
  if (rule.perPage || !first) return { papers: rule.allowed, orientations: ORIENTATIONS }
  return { papers: [first.paper], orientations: [first.orientation] }
}

export function paperChoices(catalog: CoreCatalog, book: PagedBook): PaperOptions {
  return choosablePapers(pagesRule(catalog, book).paper, book.pages)
}

// 選べるものに入るか
export function canChoose(options: PaperOptions, choice: PaperChoice): boolean {
  return options.papers.includes(choice.paper) && options.orientations.includes(choice.orientation)
}

// 次のページの紙の既定（規定の既定を選べなければ、選べるものの最初）
export function defaultPaper(catalog: CoreCatalog, book: PagedBook): PaperChoice {
  const rule = pagesRule(catalog, book).paper
  const { papers, orientations } = paperChoices(catalog, book)
  return {
    paper: papers.includes(rule.default) ? rule.default : (papers[0] ?? rule.default),
    orientation: orientations.includes(rule.orientation) ? rule.orientation : (orientations[0] ?? rule.orientation),
  }
}

// ブックで使えるアイテム（タイプの既定。置ける・引けるのはこの中だけ）
export function bookItems(catalog: CoreCatalog, book: Pick<Book, "type">): readonly string[] {
  return bookType(catalog, book.type).items.defaults
}

// タブの横に、ページを足すボタンを出すか（タイプが出すと決め、ブックで page-add が使える）
export function addsFromTabs(catalog: CoreCatalog, book: Book): boolean {
  return (
    hasPages(book) &&
    pagesRule(catalog, book).addFromTabs &&
    actionsOf(catalog, book).includes("@matomezu/base:page-add")
  )
}

// 次のページの題名の案
export function nextPageTitle(catalog: CoreCatalog, book: PagedBook, lang: Lang): string {
  return translate(catalog.messages, lang, "Page {n}", { n: book.pages.length + 1 })
}

// ページを末尾に足す。id は newId から振る（ブックのほかのページと重ならない）
export function addPage<B extends PagedBook>(
  book: B,
  init: { title: string } & PaperChoice,
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
