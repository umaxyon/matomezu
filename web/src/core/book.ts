// ブックの操作（データを書き換えず、新しい値を返す）
import { type Lang, translate } from "./i18n/i18n"
import { nextNumber } from "./ids"
import type { DrawingBook, MasterBook, Page } from "./schema/book"

// マスターのブックは 1 冊だけ
export const MASTER_BOOK: MasterBook = { type: "master", id: "master" }

export function addPage(book: DrawingBook, lang: Lang): { book: DrawingBook; page: Page } {
  const n = nextNumber(
    "p",
    book.pages.map(p => p.id),
  )
  const page = { id: `p${n}`, title: translate(lang, "ページ {n}", { n }) }
  return { book: { ...book, pages: [...book.pages, page] }, page }
}
