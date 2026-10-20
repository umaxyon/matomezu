import { expect, test } from "bun:test"
import { MASTER_BOOK } from "../../web/src/core/book"
import { searchBooks } from "../../web/src/core/book-search"
import { REGISTRY } from "../../web/src/core/registry"

const book = (id: string, title: string) => ({
  type: "drawing" as const,
  id,
  title,
  pages: [{ id: "p1", title: "ページ 1", paper: "a4", orientation: "landscape" as const }],
})
const books = [
  MASTER_BOOK,
  book("a", "画面の構成"),
  book("b", "API の一覧"),
  book("c", "Design Notes"),
  book("d", "画面の一覧"),
]

test("言葉が無ければ全部を、並びを変えずに返す", () => {
  expect(searchBooks(REGISTRY, books, "  ", "ja").map(b => b.id)).toEqual(["master", "a", "b", "c", "d"])
})

test("空白で区切った言葉が全部含まれるブックだけを返す", () => {
  expect(searchBooks(REGISTRY, books, "画面", "ja").map(b => b.id)).toEqual(["a", "d"])
  expect(searchBooks(REGISTRY, books, "画面 一覧", "ja").map(b => b.id)).toEqual(["d"])
})

test("全角と半角、大文字と小文字は区別しない", () => {
  expect(searchBooks(REGISTRY, books, "ａｐｉ", "ja").map(b => b.id)).toEqual(["b"])
  expect(searchBooks(REGISTRY, books, "design notes", "ja").map(b => b.id)).toEqual(["c"])
})

test("当てはまらなければ空", () => {
  expect(searchBooks(REGISTRY, books, "無い言葉", "ja")).toEqual([])
})

test("マスターは画面の言葉の名前で探す", () => {
  expect(searchBooks(REGISTRY, books, "マスター", "ja").map(b => b.id)).toEqual(["master"])
  expect(searchBooks(REGISTRY, books, "master", "en").map(b => b.id)).toEqual(["master"])
  expect(searchBooks(REGISTRY, books, "master", "ja")).toEqual([])
})
