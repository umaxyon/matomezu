// 郵便の行き先（ブック・ページ・物）の今の場所（開くときに探す。無ければ「行き先がありません」と出す）

import { anchorIds } from "../../../core/annotation"
import { findPage, NO_PAGE, pagesOf } from "../../../core/book"
import type { Book } from "../../../core/schema/book"
import type { Mail } from "./mail"

// 郵便の行き先の今の場所: ブック book（ページを指す郵便なら、そのページが今在るブック）と、ページ page と物 ids（郵便のまま）
export type MailPlace = NonNullable<Mail["to"]>
// 行き先が今は無い
export const GONE = "gone"

// 郵便 m の行き先の、ブックの並び books（ゴミ箱のブックは除く）の中の今の場所（行き先の無い郵便は null、今は無ければ GONE）。
// ページを指す郵便は、ページの id で探す（郵便を送ったあとにページが別のブックへ移っても、移った先を開く）
export function mailPlace(m: Mail, books: Readonly<Record<string, Book>>): MailPlace | typeof GONE | null {
  const to = m.to
  if (!to) return null
  const book = to.page ? bookHolding(books, to.book, to.page) : books[to.book]
  if (!book) return GONE
  const at = to.page ? findPage(book, to.page) : NO_PAGE
  const place = { ...to, book: book.id }
  if (!to.ids) return place
  // 物は、行き先のページの中で探す（ページを言わない郵便は、ブックのどのページでも）
  const found = (at !== NO_PAGE ? [at.page] : pagesOf(book)).some(p => {
    const ids = anchorIds(p)
    return to.ids?.some(id => ids.has(id))
  })
  return found ? place : GONE
}

// ページ page を今持つブック（郵便が言うブック book を先に見る）
function bookHolding(books: Readonly<Record<string, Book>>, book: string, page: string): Book | undefined {
  const said = books[book]
  if (said && findPage(said, page) !== NO_PAGE) return said
  return Object.values(books).find(b => findPage(b, page) !== NO_PAGE)
}
