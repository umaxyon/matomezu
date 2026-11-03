// 許可の範囲（core/def/action.ts の scopeOf・libraryScopeOf）: アクションの宣言から、引数での所と、一覧が対象なら変えるブックと作るブックのタイプを出す
import { expect, test } from "bun:test"
import { libraryScopeOf, scopeOf } from "../../web/src/core/def/action"

test("許可の範囲から所を出す: book は所なし、引数の名前はその値、関数はその返り値、無ければ分からない", () => {
  const args = { page: "p1", list: "k1", items: ["a", "b"] }
  expect(scopeOf("book", args)).toEqual({})
  expect(scopeOf({ page: "page" }, args)).toEqual({ page: "p1" })
  expect(scopeOf({ page: "page", item: "list" }, args)).toEqual({ page: "p1", items: ["k1"] })
  expect(scopeOf({ page: "page", items: "items" }, args)).toEqual({ page: "p1", items: ["a", "b"] })
  expect(scopeOf(() => ({ page: "p9" }), args)).toEqual({ page: "p9" })
  expect(scopeOf(undefined, args)).toBeUndefined()
})

test("book・books の引数の名前から変えるブックを出し、where に all-pages を書けばブックの全部を変える。文字でない値は外す", () => {
  expect(libraryScopeOf({ book: "book" }, { book: "b1" })).toEqual({ books: [{ book: "b1", where: {} }], creates: [] })
  expect(libraryScopeOf({ book: "book", where: "all-pages" }, { book: "b1" })).toEqual({
    books: [{ book: "b1", where: { allPages: true } }],
    creates: [],
  })
  expect(libraryScopeOf({ books: "books" }, { books: ["b1", 2, "b3"] })).toEqual({
    books: [
      { book: "b1", where: {} },
      { book: "b3", where: {} },
    ],
    creates: [],
  })
  expect(libraryScopeOf({ book: "book" }, { book: 1 })).toEqual({ books: [], creates: [] })
})

test("create は作るブックのタイプを出す。関数はそのまま返し、unknown と書かないアクションは分からない（null）", () => {
  expect(libraryScopeOf({ create: "type" }, { type: "@ex/t:t" })).toEqual({ books: [], creates: ["@ex/t:t"] })
  const targets = { books: [{ book: "b9", where: {} }], creates: [] }
  expect(libraryScopeOf(() => targets, {})).toBe(targets)
  expect(libraryScopeOf("unknown", {})).toBeNull()
  expect(libraryScopeOf(undefined, {})).toBeNull()
})
