import { expect, test } from "bun:test"
import { searchBooks } from "../../web/src/plugins/base/book-open/book-search"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { CORE_CATALOG } from "../support"

const book = (id: string, title: string) => ({
  type: "@matomezu/drawing:drawing" as const,
  id,
  title,
  pages: [{ id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" as const }],
})
const books = [
  MASTER_BOOK,
  book("a", "画面の構成"),
  book("b", "API の一覧"),
  book("c", "Design Notes"),
  book("d", "画面の一覧"),
]

test("言葉が無ければ全部を、並びを変えずに返す", () => {
  expect(searchBooks(CORE_CATALOG, books, "  ", "ja").map(b => b.id)).toEqual([
    "@matomezu/master:master",
    "a",
    "b",
    "c",
    "d",
  ])
})

test("空白で区切った言葉が全部含まれるブックだけを返す", () => {
  expect(searchBooks(CORE_CATALOG, books, "画面", "ja").map(b => b.id)).toEqual(["a", "d"])
  expect(searchBooks(CORE_CATALOG, books, "画面 一覧", "ja").map(b => b.id)).toEqual(["d"])
})

test("全角と半角、大文字と小文字は区別しない", () => {
  expect(searchBooks(CORE_CATALOG, books, "ａｐｉ", "ja").map(b => b.id)).toEqual(["b"])
  expect(searchBooks(CORE_CATALOG, books, "design notes", "ja").map(b => b.id)).toEqual(["c"])
})

test("当てはまらなければ空", () => {
  expect(searchBooks(CORE_CATALOG, books, "無い言葉", "ja")).toEqual([])
})

test("マスターは画面の言葉の名前で探す", () => {
  expect(searchBooks(CORE_CATALOG, books, "マスター", "ja").map(b => b.id)).toEqual(["@matomezu/master:master"])
  expect(searchBooks(CORE_CATALOG, books, "master", "en").map(b => b.id)).toEqual(["@matomezu/master:master"])
  expect(searchBooks(CORE_CATALOG, books, "master", "ja")).toEqual([])
})

test("触れた時刻があれば新しい順に並べ、時刻の無いブックは後ろに元の並びのまま", () => {
  const touched = { c: "2026-10-27T01:00:00Z", a: "2026-10-27T02:00:00Z" }
  expect(searchBooks(CORE_CATALOG, books, "", "ja", touched).map(b => b.id)).toEqual([
    "a",
    "c",
    MASTER_BOOK.id,
    "b",
    "d",
  ])
})
