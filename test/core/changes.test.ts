// ブックの変化（core/changes.ts）: 前と後のブックを比べ、変わったフィールド・並び・ページ・アイテムを返す
import { expect, test } from "bun:test"
import { changesOf } from "../../web/src/core/changes"
import type { Book } from "../../web/src/core/schema/book"

const p = (id: string, rest: object = {}) => ({ kind: "page", id, type: "t", title: id, ...rest })
const book = (fields: object) =>
  ({
    id: "b1",
    title: "",
    lineup: [p("p1", { items: [{ id: "a" }, { id: "b" }] }), p("p2")],
    ...fields,
  }) as unknown as Book

test("変わったブックのフィールドと、並びが変わったか、ページごとに変わったフィールドとアイテムを返す", () => {
  const before = book({})
  const after = book({
    title: "x",
    lineup: [p("p1", { locked: true, items: [{ id: "a", w: 1 }, { id: "c" }] }), p("p3", { items: [{ id: "d" }] })],
  })
  expect(changesOf(before, after)).toEqual({
    gone: false,
    place: "same",
    added: false,
    fields: ["title"],
    lineup: true,
    pages: [
      { id: "p1", change: "changed", fields: ["locked"], items: ["a", "b", "c"] },
      { id: "p2", change: "removed", fields: [], items: [] },
      { id: "p3", change: "added", fields: [], items: ["d"] },
    ],
  })
})

test("ページの中だけを変えたなら並びは変わらない。順・バインダの名前・バインダの中の順が変われば並びが変わった", () => {
  const binder = (title: string, ids: string[]) => ({
    kind: "binder",
    id: "f1",
    title,
    pageType: "s",
    lineup: ids.map(id => p(id)),
  })
  const before = book({ lineup: [p("p1"), binder("f", ["s1", "s2"])] })
  expect(changesOf(before, book({ lineup: [p("p1", { title: "y" }), binder("f", ["s1", "s2"])] })).lineup).toBe(false)
  expect(changesOf(before, book({ lineup: [binder("f", ["s1", "s2"]), p("p1")] })).lineup).toBe(true)
  expect(changesOf(before, book({ lineup: [p("p1"), binder("g", ["s1", "s2"])] })).lineup).toBe(true)
  expect(changesOf(before, book({ lineup: [p("p1"), binder("f", ["s2", "s1"])] })).lineup).toBe(true)
})

test("同じなら何も変わらず、後が無ければ一覧から無くなった", () => {
  expect(changesOf(book({}), book({}))).toEqual({
    gone: false,
    place: "same",
    added: false,
    fields: [],
    lineup: false,
    pages: [],
  })
  expect(changesOf(book({}), undefined)).toEqual({
    gone: true,
    place: "same",
    added: false,
    fields: [],
    lineup: false,
    pages: [],
  })
})

test("置き場所の変化（ゴミ箱に入ったなど）を言われたブックは、値が同じでも、それが付く", () => {
  expect(changesOf(book({}), book({}), { place: "trashed" })).toEqual({
    gone: false,
    place: "trashed",
    added: false,
    fields: [],
    lineup: false,
    pages: [],
  })
})

test("前が無ければ一覧に新しく増えた: フィールドはどれも変わり、どのページも足した", () => {
  expect(changesOf(undefined, book({ title: "x", lineup: [p("p1", { items: [{ id: "a" }] })] }))).toEqual({
    gone: false,
    place: "same",
    added: true,
    fields: expect.arrayContaining(["title"]),
    lineup: true,
    pages: [{ id: "p1", change: "added", fields: [], items: ["a"] }],
  })
})

test("ページの slide に置いたアイテムの id も items に入り、slide はページのフィールドに出ない", () => {
  const withSlide = (slide: object[]) => book({ lineup: [p("p1", { slide })] })
  expect(changesOf(withSlide([{ id: "a" }, { id: "b" }]), withSlide([{ id: "a", x: 1 }, { id: "c" }])).pages).toEqual([
    { id: "p1", change: "changed", fields: [], items: ["a", "b", "c"] },
  ])
  expect(changesOf(undefined, withSlide([{ id: "a" }])).pages).toEqual([
    { id: "p1", change: "added", fields: [], items: ["a"] },
  ])
})
