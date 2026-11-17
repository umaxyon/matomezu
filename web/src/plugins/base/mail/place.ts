// 郵便の行き先（ブック・ページ・物）が今もあるか（開くときに確かめる。無ければ「行き先がありません」と出す）

import { anchorIds } from "../../../core/annotation"
import { findPage, pagesOf } from "../../../core/book"
import type { Book } from "../../../core/schema/book"
import type { Mail } from "./mail"

// 郵便 m の行き先が、ブックの並び books（ゴミ箱のブックは除く）に今もあるか（行き先の無い郵便は null）
export function placeExists(m: Mail, books: Readonly<Record<string, Book>>): boolean | null {
  const to = m.to
  if (!to) return null
  const book = books[to.book]
  if (!book) return false
  const page = to.page ? findPage(book, to.page)?.page : undefined
  if (to.page && !page) return false
  if (!to.ids) return true
  // 物は、行き先のページの中で探す（ページを言わない郵便は、ブックのどのページでも）
  return (page ? [page] : pagesOf(book)).some(p => {
    const ids = anchorIds(p)
    return to.ids?.some(id => ids.has(id))
  })
}
