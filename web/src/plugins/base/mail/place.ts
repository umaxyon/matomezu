// 郵便の行き先（ブック・ページ・物）が今もあるか（開くときに確かめる。無ければ「行き先がありません」と出す）
import { anchorIds } from "../../../core/annotation"
import type { Mail } from "../../../core/mail"
import type { Book } from "../../../core/schema/book"

// 郵便 m の行き先が、ブックの並び books（ゴミ箱のブックは除く）に今もあるか（行き先の無い郵便は null）
export function placeExists(m: Mail, books: Readonly<Record<string, Book>>): boolean | null {
  const to = m.to
  if (!to) return null
  const book = books[to.book]
  if (!book) return false
  const pages = "pages" in book ? (book.pages as readonly { id: string }[]) : []
  if (to.page && !pages.some(p => p.id === to.page)) return false
  if (!to.ids) return true
  const ids = anchorIds(book)
  return to.ids.some(id => ids.has(id))
}
