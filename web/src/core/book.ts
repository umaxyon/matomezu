// ブックの操作（データを書き換えず、新しい値を返す）
import type { Lang } from "./i18n/i18n"
import { translate } from "./i18n/i18n"
import { nextNumber } from "./ids"
import { bookType } from "./registry"
import type { Book, BookOf, Page } from "./schema/book"

export type PagedBook = Extract<Book, { pages: Page[] }>

// マスターのブック（1 冊だけ）
export const MASTER_BOOK: BookOf<"master"> = { type: "master", id: "master" }

export function hasPages(book: Book): book is PagedBook {
  return "pages" in book
}

// 画面に出すブックの名前。題名を持たないブックは、タイプの名前で呼ぶ
export function bookTitle(book: Book, lang: Lang): string {
  return "title" in book ? book.title : translate(lang, bookType(book.type).title)
}

export function addPage<B extends PagedBook>(book: B, lang: Lang): { book: B; page: Page } {
  const n = nextNumber(
    "p",
    book.pages.map(p => p.id),
  )
  const page = { id: `p${n}`, title: translate(lang, "ページ {n}", { n }) }
  return { book: { ...book, pages: [...book.pages, page] }, page }
}
