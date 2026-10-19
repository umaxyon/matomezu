// ブックの操作（データを書き換えず、新しい値を返す）
import { nextNumber } from "./ids"
import type { Book, Page } from "./schema/book"

export function addPage(book: Book): { book: Book; page: Page } {
  const n = nextNumber(
    "p",
    book.pages.map(p => p.id),
  )
  const page = { id: `p${n}`, title: `ページ ${n}` }
  return { book: { ...book, pages: [...book.pages, page] }, page }
}
