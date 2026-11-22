// ダイアログが開いている間に掛ける編集ロックの所（base/dialog-host/locks.ts）
import { expect, test } from "bun:test"
import type { BinderEntry } from "../../../web/src/core/schema/book"
import { locksOf } from "../../../web/src/plugins/base/dialog-host/locks"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../../lineup"

const binder = testBinder("n1", "束", SLIDE, testPage(SLIDE, "s1", { title: "1" })) as BinderEntry

test("ブックでは、ページの id はそのページ、バインダの id はブック、ほかは開いているページに掛ける", () => {
  const book = testBook("b1", "ブック", [drawingPage("p1"), binder])
  expect(locksOf(book, "p1", ["p1", "n1", "item"])).toEqual([
    { within: "p1", ids: ["p1", "item"] },
    { within: "b1", ids: ["n1"] },
  ])
})

test("ブックの外のバインダでは、バインダの id はそのバインダ、中のページの id はそのページに掛ける", () => {
  const lineup = { id: "n1", lineup: [binder] }
  expect(locksOf(lineup, "s1", ["n1"])).toEqual([{ within: "n1", ids: ["n1"] }])
  expect(locksOf(lineup, "s1", ["s1"])).toEqual([{ within: "s1", ids: ["s1"] }])
})

test("ブックの外のページ 1 枚では、どれも開いているページに掛ける。開いているページが無ければ掛けない", () => {
  expect(locksOf(null, "x1", ["x1", "item"])).toEqual([{ within: "x1", ids: ["x1", "item"] }])
  expect(locksOf(null, null, ["x1"])).toEqual([])
})
