import { expect, test } from "bun:test"
import { searchBooks } from "../../../web/src/plugins/base/book-open/book-search"
import { pagesBook } from "../../lineup"

const book = (id: string, title: string) =>
  pagesBook({
    type: "@matomezu/drawing:drawing" as const,
    id,
    title,
    pages: [{ id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" as const }],
  })
const books = [
  book("u", ""),
  book("a", "画面の構成"),
  book("b", "API の一覧"),
  book("c", "Design Notes"),
  book("d", "画面の一覧"),
]

test("言葉が無ければ全部を、並びを変えずに返す", () => {
  expect(searchBooks(books, "  ").map(b => b.id)).toEqual(["u", "a", "b", "c", "d"])
})

test("空白で区切った言葉が全部含まれるブックだけを返す", () => {
  expect(searchBooks(books, "画面").map(b => b.id)).toEqual(["a", "d"])
  expect(searchBooks(books, "画面 一覧").map(b => b.id)).toEqual(["d"])
})

test("全角と半角、大文字と小文字は区別しない", () => {
  expect(searchBooks(books, "ａｐｉ").map(b => b.id)).toEqual(["b"])
  expect(searchBooks(books, "design notes").map(b => b.id)).toEqual(["c"])
})

test("当てはまらなければ空", () => {
  expect(searchBooks(books, "無い言葉")).toEqual([])
})

test("触れた時刻があれば新しい順に並べ、時刻の無いブックは後ろに元の並びのまま", () => {
  const touched = { c: "2026-10-27T01:00:00Z", a: "2026-10-27T02:00:00Z" }
  expect(searchBooks(books, "", touched).map(b => b.id)).toEqual(["a", "c", "u", "b", "d"])
})
