// ブックの操作（データを書き換えず、新しい値を返す）
import { type Lang, translate } from "./i18n/i18n"
import { nextNumber } from "./ids"
import type { Book, Page } from "./schema/book"

export function addPage(book: Book, lang: Lang): { book: Book; page: Page } {
  const n = nextNumber(
    "p",
    book.pages.map(p => p.id),
  )
  const page = { id: `p${n}`, title: translate(lang, "ページ {n}", { n }) }
  return { book: { ...book, pages: [...book.pages, page] }, page }
}
