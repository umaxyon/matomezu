// 郵便の行き先の今の場所（base/mail/place.ts の mailPlace）: ブック・ページ・物のどれが無くなっても無い（GONE）。物は 1 つでも残っていれば有る。
// ページを指す郵便は、ページの id で今のブックを探す

import { expect, test } from "bun:test"
import { pagesOf } from "../../../web/src/core/book"
import { HOME_ID } from "../../../web/src/core/folders"
import type { Book } from "../../../web/src/core/schema/book"
import { addPageIn, createBookIn } from "../../../web/src/plugins/base"
import type { Mail } from "../../../web/src/plugins/base/mail/mail"
import { GONE, mailPlace } from "../../../web/src/plugins/base/mail/place"
import { drawingPage, testBook } from "../../lineup"
import { newStore } from "../../support"

// 郵便 m の行き先が今あるか（無い郵便は null）
const placeExists = (m: Mail, books: Readonly<Record<string, Book>>) => {
  const place = mailPlace(m, books)
  return place === null ? null : place !== GONE
}

function ready() {
  const store = newStore()
  expect(createBookIn(store, "s1", { into: HOME_ID, title: "図" })).toBe(true)
  const books = store.state.getState().books as Readonly<Record<string, Book>>
  const id = Object.keys(books).at(-1)!
  return { books, id }
}
const mail = (to: Mail["to"]): Mail =>
  ({ id: "m1", mail: "@matomezu/base:letter", from: "x", sentAt: "t", props: {}, to }) as Mail

test("行き先の無い郵便は null。ブックが無ければ false、ブックだけを指していればあれば true", () => {
  const { books, id } = ready()
  expect(placeExists(mail(undefined), books)).toBeNull()
  expect(placeExists(mail({ book: "nope" }), books)).toBe(false)
  expect(placeExists(mail({ book: id }), books)).toBe(true)
})

test("ページを指しているときは、そのページがブックに無ければ false", () => {
  const { books, id } = ready()
  expect(placeExists(mail({ book: id, page: "nope" }), books)).toBe(false)
})

test("物を指しているときは、1 つでも今もあれば true、どれも無ければ false", () => {
  const store = newStore()
  expect(createBookIn(store, "s1", { into: HOME_ID, title: "図" })).toBe(true)
  expect(addPageIn(store, "s1", { type: "@matomezu/drawing:drawing", title: "p" })).toBe(true)
  const id = Object.keys(store.state.getState().books).at(-1)!
  const page = pagesOf(store.state.getState().books[id]!)[0]?.id ?? ""
  const placed = store.actions.perform(
    "@matomezu/paper:item-place",
    { item: "@matomezu/box:shape-nest-box", at: { x: 40, y: 40 } },
    { page },
  )
  expect(placed.ok).toBe(true)
  const item = (placed as { result: { item: string } }).result.item
  const books = store.state.getState().books as Readonly<Record<string, Book>>
  expect(placeExists(mail({ book: id, page, ids: [item] }), books)).toBe(true)
  expect(placeExists(mail({ book: id, page, ids: ["gone", item] }), books)).toBe(true)
  expect(placeExists(mail({ book: id, page, ids: ["gone"] }), books)).toBe(false)
})

test("ページを指す郵便は、ページが別のブックへ移っていれば、移った先のブックを行き先にする（言うブックに在れば、そのブック）", () => {
  const b1 = testBook("b1", "前", [drawingPage("p2", { title: "2" })])
  const b2 = testBook("b2", "後", [drawingPage("p1", { title: "1" })])
  const books = { b1, b2 } as Readonly<Record<string, Book>>
  expect(mailPlace(mail({ book: "b1", page: "p1" }), books)).toEqual({ book: "b2", page: "p1" })
  expect(mailPlace(mail({ book: "b1", page: "p2" }), books)).toEqual({ book: "b1", page: "p2" })
  expect(mailPlace(mail({ book: "gone", page: "p1" }), books)).toEqual({ book: "b2", page: "p1" })
  expect(mailPlace(mail({ book: "b1", page: "nope" }), books)).toBe(GONE)
})
