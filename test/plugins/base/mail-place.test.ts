// 郵便の行き先が今もあるか（base/mail/place.ts の placeExists）: ブック・ページ・物のどれが無くなっても無い。物は 1 つでも残っていれば有る

import { expect, test } from "bun:test"
import { pagesOf } from "../../../web/src/core/book"
import type { Book } from "../../../web/src/core/schema/book"
import { addPageIn, createBookIn } from "../../../web/src/plugins/base"
import type { Mail } from "../../../web/src/plugins/base/mail/mail"
import { placeExists } from "../../../web/src/plugins/base/mail/place"
import { newStore } from "../../support"

function ready() {
  const store = newStore()
  expect(createBookIn(store, "s1", { title: "図" })).toBe(true)
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
  expect(createBookIn(store, "s1", { title: "図" })).toBe(true)
  expect(addPageIn(store, "s1", { type: "@matomezu/drawing:drawing", title: "p" })).toBe(true)
  const id = Object.keys(store.state.getState().books).at(-1)!
  const page = pagesOf(store.state.getState().books[id] as unknown as { pages: { id: string }[] })[0]?.id ?? ""
  const placed = store.actions.perform(
    "@matomezu/paper:item-place",
    { page, item: "@matomezu/box:shape-nest-box", at: { x: 40, y: 40 } },
    { book: id },
  )
  expect(placed.ok).toBe(true)
  const item = (placed as { result: { item: string } }).result.item
  const books = store.state.getState().books as Readonly<Record<string, Book>>
  expect(placeExists(mail({ book: id, page, ids: [item] }), books)).toBe(true)
  expect(placeExists(mail({ book: id, page, ids: ["gone", item] }), books)).toBe(true)
  expect(placeExists(mail({ book: id, page, ids: ["gone"] }), books)).toBe(false)
})
