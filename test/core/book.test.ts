import { expect, test } from "bun:test"
import { addPage } from "../../web/src/core/book"
import { BookSchema } from "../../web/src/core/schema/book"

test("ページを足すと、使っていない一番小さい番号を使う", () => {
  const book = {
    id: "b1",
    title: "ブック",
    pages: [
      { id: "p1", title: "ページ 1" },
      { id: "p3", title: "ページ 3" },
    ],
  }
  const { book: next, page } = addPage(book, "ja")
  expect(page).toEqual({ id: "p2", title: "ページ 2" })
  expect(next.pages.map(p => p.id)).toEqual(["p1", "p3", "p2"])
  expect(book.pages).toHaveLength(2)
  expect(addPage(book, "en").page.title).toBe("Page 2")
})

test("ブックの形に無い項目は誤り", () => {
  const ok = { id: "b1", title: "ブック", pages: [{ id: "p1", title: "ページ 1" }] }
  expect(BookSchema.safeParse(ok).success).toBe(true)
  expect(BookSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false)
  expect(BookSchema.safeParse({ ...ok, pages: [] }).success).toBe(false)
})
