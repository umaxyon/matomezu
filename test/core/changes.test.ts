// ブックの変化（core/changes.ts）: 前と後のブックを比べ、変わったフィールド・ページ・アイテムを返す
import { expect, test } from "bun:test"
import { changesOf } from "../../web/src/core/changes"
import type { Book } from "../../web/src/core/schema/book"

const book = (fields: object) =>
  ({
    type: "t",
    id: "b1",
    title: "",
    pages: [
      { id: "p1", title: "1", items: [{ id: "a" }, { id: "b" }] },
      { id: "p2", title: "2" },
    ],
    ...fields,
  }) as unknown as Book

test("変わったブックのフィールドと、ページごとに変わったフィールドとアイテムを返す", () => {
  const before = book({})
  const after = book({
    title: "x",
    pages: [
      { id: "p1", title: "1", locked: true, items: [{ id: "a", w: 1 }, { id: "c" }] },
      { id: "p3", title: "3", items: [{ id: "d" }] },
    ],
  })
  expect(changesOf(before, after)).toEqual({
    gone: false,
    fields: ["title"],
    pages: [
      { id: "p1", change: "changed", fields: ["locked"], items: ["a", "b", "c"] },
      { id: "p2", change: "removed", fields: [], items: [] },
      { id: "p3", change: "added", fields: [], items: ["d"] },
    ],
  })
})

test("同じなら何も変わらず、後が無ければ一覧から無くなった", () => {
  expect(changesOf(book({}), book({}))).toEqual({ gone: false, fields: [], pages: [] })
  expect(changesOf(book({}), undefined)).toEqual({ gone: true, fields: [], pages: [] })
})
