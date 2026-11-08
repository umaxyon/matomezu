// 郵便の行き先が今もあるか（base/mail/place.ts の placeExists）: ブック・ページ・物のどれが無くなっても無い。物は 1 つでも残っていれば有る

import { expect, test } from "bun:test"
import type { Mail } from "../../web/src/core/mail"
import type { Book } from "../../web/src/core/schema/book"
import { createBookIn } from "../../web/src/plugins/base"
import { placeExists } from "../../web/src/plugins/base/mail/place"
import { newStore } from "../support"

function ready() {
  const store = newStore()
  expect(createBookIn(store, "s1", { title: "図", type: "@matomezu/drawing:drawing" })).toBe(true)
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
