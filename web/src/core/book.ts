// ブックの操作（データを書き換えず、新しい値を返す）
import { type Lang, translate } from "./i18n/i18n"
import { nextNumber } from "./ids"
import type { Book, DrawingBook, MasterBook, Page } from "./schema/book"

// マスターのブックは 1 冊だけ
export const MASTER_BOOK: MasterBook = { type: "master", id: "master" }

// 画面に出すブックの名前。マスターは題名を持たず、画面の言葉で呼ぶ
export function bookTitle(book: Book, lang: Lang): string {
  return book.type === "master" ? translate(lang, "マスター") : book.title
}

export function addPage(book: DrawingBook, lang: Lang): { book: DrawingBook; page: Page } {
  const n = nextNumber(
    "p",
    book.pages.map(p => p.id),
  )
  const page = { id: `p${n}`, title: translate(lang, "ページ {n}", { n }) }
  return { book: { ...book, pages: [...book.pages, page] }, page }
}
