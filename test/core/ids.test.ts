// アクションの中で振る id（core/ids.ts の idMaker と、base の utils/ids.ts）: ブックの全部のページの中身の、どの深さの id とも重ならず、続けて振った id どうしも重ならない
import { expect, test } from "bun:test"
import type { PagedBook } from "../../web/src/core/book"
import { idMaker } from "../../web/src/core/ids"
import { contentIdMaker, idsIn } from "../../web/src/plugins/base/utils/ids"

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

test("contentIdMaker は、ほかのページのアイテムの中身やページのフィールドの中の id も避け、ページの id は避けない", () => {
  const book = {
    id: "book",
    type: "t",
    title: "b",
    pages: [
      { id: "p1", title: "1", items: [{ id: "i1", item: "x", children: [{ id: "row1" }] }] },
      { id: "p2", title: "2", nodes: [{ id: "n1", children: [{ id: "n2" }] }] },
    ],
  } as unknown as PagedBook
  const make = contentIdMaker(book, seq("i1", "row1", "n1", "n2", "p1", "z"))
  expect(make()).toBe("p1")
  expect(make()).toBe("z")
})
