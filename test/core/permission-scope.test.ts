// 許可の範囲（core/def/action.ts の scopeOf）: アクションの宣言から、引数での所を出す
import { expect, test } from "bun:test"
import { scopeOf } from "../../web/src/core/def/action"

test("許可の範囲から所を出す: book は所なし、引数の名前はその値、関数はその返り値、無ければ分からない", () => {
  const args = { page: "p1", list: "k1", items: ["a", "b"] }
  expect(scopeOf("book", args)).toEqual({})
  expect(scopeOf({ page: "page" }, args)).toEqual({ page: "p1" })
  expect(scopeOf({ page: "page", item: "list" }, args)).toEqual({ page: "p1", items: ["k1"] })
  expect(scopeOf({ page: "page", items: "items" }, args)).toEqual({ page: "p1", items: ["a", "b"] })
  expect(scopeOf(() => ({ page: "p9" }), args)).toEqual({ page: "p9" })
  expect(scopeOf(undefined, args)).toBeUndefined()
})
