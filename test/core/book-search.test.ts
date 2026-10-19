import { expect, test } from "bun:test"
import { searchBooks } from "../../web/src/core/book-search"

const book = (id: string, title: string) => ({ id, title, pages: [{ id: "p1", title: "ページ 1" }] })
const books = [book("a", "画面の構成"), book("b", "API の一覧"), book("c", "Design Notes"), book("d", "画面の一覧")]

test("言葉が無ければ全部を、並びを変えずに返す", () => {
  expect(searchBooks(books, "  ").map(b => b.id)).toEqual(["a", "b", "c", "d"])
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
