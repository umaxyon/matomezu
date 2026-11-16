// アクションの中で振る id（core/ids.ts の idMaker と、base の utils/ids.ts）: ブックの全部のページの中身の、どの深さの id とも重ならず、続けて振った id どうしも重ならない。changedIn は、前後の値で物が変わったか

import { expect, test } from "bun:test"
import { changedIn, idMaker, idsIn } from "../../web/src/core/ids"
import type { ItemPage } from "../../web/src/core/placed"
import type { Book } from "../../web/src/core/schema/book"
import { contentIdMaker, contentIdMakerOfBook, renewedIds } from "../../web/src/plugins/base/utils/ids"

// 決めた並びの値を返す newId（尽きたら同じ値を返し続ける）
const seq = (...values: string[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)] as string
}

test("idsIn は、中の作りを知らずに、どの深さのオブジェクトの id も集める（文字列でない id は集めない）", () => {
  expect(
    idsIn({
      items: [{ id: "a", props: { x: 1 }, children: [{ id: "b", children: [{ id: "c" }] }] }],
      root: { caption: "根" },
      nodes: [{ id: "d", children: [{ id: "e" }] }],
      other: { id: 3 },
    }).sort(),
  ).toEqual(["a", "b", "c", "d", "e"])
})

test("idMaker は、使われている id と、前に振った id を避けて振る", () => {
  const make = idMaker(seq("aaaa", "bbbb", "aaaa", "bbbb", "cccc"), ["aaaa"])
  expect(make()).toBe("bbbb")
  expect(make()).toBe("cccc") // aaaa は使われていて、bbbb は前に振った
})

test("contentIdMakerOfBook は、ほかのページのアイテムの中身やページのフィールドの中の id も避け、ページの id は避けない", () => {
  const book = {
    id: "book",
    title: "b",
    lineup: [
      { kind: "page", id: "p1", type: "t", title: "1", items: [{ id: "i1", item: "x", children: [{ id: "row1" }] }] },
      { kind: "page", id: "p2", type: "t", title: "2", nodes: [{ id: "n1", children: [{ id: "n2" }] }] },
    ],
  } as unknown as Book
  const make = contentIdMakerOfBook(book, seq("i1", "row1", "n1", "n2", "p1", "z"))
  expect(make()).toBe("p1")
  expect(make()).toBe("z")
})

test("contentIdMaker と renewedIds は、渡したページの中身の id だけを避ける（ページの id は避けない）", () => {
  const page = {
    kind: "page",
    id: "p1",
    type: "t",
    title: "1",
    items: [{ id: "i1", item: "x", children: [{ id: "row1" }] }],
  } as unknown as ItemPage
  const make = contentIdMaker(page, seq("i1", "row1", "p1", "z"))
  expect(make()).toBe("p1")
  expect(make()).toBe("z")
  // 写しの中の id は全部振り直し、つなぐ相手も付け替える
  const copy = renewedIds(
    page,
    { shapes: [{ id: "i1" }, { id: "k" }], lines: [{ id: "l", from: "i1", to: "out" }] },
    seq("i1", "a", "b", "c"),
  )
  expect(copy).toEqual({ shapes: [{ id: "a" }, { id: "b" }], lines: [{ id: "c", from: "a", to: "out" }] })
})

test("changedIn は、前にあった物のうち、変わったか無くなった物（中の物が変わっても変わったとする）", () => {
  const before = {
    items: [
      { id: "a", props: { x: 1 }, children: [{ id: "r", x: 1 }] },
      { id: "b", x: 1 },
    ],
  }
  const after = { items: [{ id: "a", props: { x: 1 }, children: [{ id: "r", x: 2 }] }] }
  expect(changedIn(before, after, ["a", "r", "b", "z"])).toEqual(["a", "r", "b"])
  expect(changedIn(before, before, ["a", "r", "b"])).toEqual([])
})
