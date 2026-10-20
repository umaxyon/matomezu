// ブックの操作（データを書き換えず、新しい値を返す）
import type { Lang } from "./i18n/i18n"
import { translate } from "./i18n/i18n"
import { nextNumber } from "./ids"
import type { PaperName, PaperRule } from "./paper"
import { actionsOf } from "./perform"
import { type BookTypeId, bookType } from "./registry"
import type { Book, BookOf, Page } from "./schema/book"

export type PagedBook = Extract<Book, { pages: Page[] }>

// マスターのブック（1 冊だけ）
export const MASTER_BOOK: BookOf<"master"> = { type: "master", id: "master" }

export function hasPages(book: Book): book is PagedBook {
  return "pages" in book
}

// 画面に出すブックの名前。題名を持たないか空のブックは、タイプの名前で呼ぶ
export function bookTitle(book: Book, lang: Lang): string {
  return "title" in book && book.title.trim() !== "" ? book.title : translate(lang, bookType(book.type).title)
}

function pagesRule(book: PagedBook) {
  const rule = bookType(book.type as BookTypeId).pages
  if (!rule) throw new Error(`book type ${book.type} has no pages`)
  return rule
}

// 規定の下で、次のページに選べる紙。1 冊の紙をそろえる規定では、最初のページの紙だけ
export function choosablePapers(rule: PaperRule, pages: readonly Page[]): readonly PaperName[] {
  const first = pages[0]
  return rule.perPage || !first ? rule.allowed : [first.paper]
}

// そのブックの次のページに選べる紙
export function paperChoices(book: PagedBook): readonly PaperName[] {
  return choosablePapers(pagesRule(book).paper, book.pages)
}

// 次のページの紙の既定
export function defaultPaper(book: PagedBook): PaperName {
  const choices = paperChoices(book)
  const preferred = pagesRule(book).paper.default
  return choices.includes(preferred) ? preferred : (choices[0] ?? preferred)
}

// タブの横に、ページを足すボタンを出すか（タイプが出すと決め、ブックで page.add が使える）
export function addsFromTabs(book: Book): boolean {
  return hasPages(book) && pagesRule(book).addFromTabs && actionsOf(book).includes("page.add")
}

// 次のページの題名の案
export function nextPageTitle(book: PagedBook, lang: Lang): string {
  return translate(lang, "ページ {n}", { n: book.pages.length + 1 })
}

export function addPage<B extends PagedBook>(
  book: B,
  init: { title: string; paper: PaperName },
): { book: B; page: Page } {
  const n = nextNumber(
    "p",
    book.pages.map(p => p.id),
  )
  const page = { id: `p${n}`, ...init }
  return { book: { ...book, pages: [...book.pages, page] }, page }
}
