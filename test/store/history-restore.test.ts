// 画面の履歴の段の置き直し: restoreArgs は 2 つのブックの違う所（フィールド・ページ・最上位のアイテム）だけを、片方の値にする値を作り、applyRestore が今のブックの上で行う
import { expect, test } from "bun:test"
import type { Book } from "../../web/src/core/schema/book"
import { applyRestore, restoreArgs } from "../../web/src/plugins/base/history/restore"

const item = (id: string, caption = id) => ({ id, item: "x", x: 0, y: 0, props: { caption } })
const book = (fields: Record<string, unknown>, pages: unknown[]) =>
  ({ type: "t", id: "b", title: "本", ...fields, pages }) as unknown as Book
const page = (id: string, items: unknown[], fields: Record<string, unknown> = {}) => ({
  id,
  title: id,
  ...fields,
  items,
})

test("無くなったフィールドは外し、変わったフィールドは前の値にする", () => {
  const before = book({ locked: true }, [])
  const after = book({ title: "別" }, [])
  expect(applyRestore(after, restoreArgs(after, before))).toEqual(before)
})

test("消したアイテムは元の並びの所に、足したアイテムは外し、変えたアイテムは前の値にする", () => {
  const before = book({}, [page("p", [item("a"), item("b"), item("c")])])
  const after = book({}, [page("p", [item("a", "A"), item("c"), item("d")])])
  expect(applyRestore(after, restoreArgs(after, before))).toEqual(before)
  expect(applyRestore(before, restoreArgs(before, after))).toEqual(after)
})

test("消したページは元の並びの所に戻し、足したページは外す。ページのフィールドも前の値にする", () => {
  const before = book({}, [page("p", []), page("q", [item("a")], { locked: true })])
  const after = book({}, [page("q", [item("a")]), page("r", [])])
  expect(applyRestore(after, restoreArgs(after, before))).toEqual(before)
})

test("画面の履歴の段の間にほかで変わった所は、画面の履歴の段が変えた所でなければ残す。画面の履歴の段が変えたページが無くなっていれば飛ばす", () => {
  const before = book({}, [page("p", [item("a")]), page("q", [item("x")])])
  const after = book({}, [page("p", [item("a", "A")]), page("q", [item("x", "X")])])
  const now = book({ title: "AI" }, [page("p", [item("a", "A"), item("ai")])])
  expect(applyRestore(now, restoreArgs(after, before))).toEqual(
    book({ title: "AI" }, [page("p", [item("a"), item("ai")])]),
  )
})
