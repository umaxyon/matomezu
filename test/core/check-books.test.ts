import { expect, test } from "bun:test"
import { checkBooks } from "../../web/src/core/book"
import { warningText } from "../../web/src/core/warnings"
import { drawingPage, testBook } from "../lineup"
import { SAMPLE_BOOKS } from "../sample-books"
import { CORE_CATALOG } from "../support"

test("読めるブックと、ブックごと読めないブックの warning（読めないページを持つ W027〜W029・ブックの形に合わない W005・並びの決まりを守らない W006）に分ける", () => {
  const ok = SAMPLE_BOOKS[0]!
  const noType = testBook("x1", "スタンプ帳", [{ ...drawingPage("q1"), type: "@foo/stamps:board" } as never])
  const misfit = { ...ok, id: "x2", title: "壊れた図面", lineup: "?" }
  const twins = testBook("x3", "双子", [drawingPage("q2", { title: "同じ" }), drawingPage("q3", { title: "同じ" })])
  const done = checkBooks(CORE_CATALOG, [ok, noType, misfit, twins])
  expect(done.books.map(b => b.id)).toEqual([ok.id])
  expect(done.warnings.map(warningText)).toEqual([
    "W027 : book x1 (スタンプ帳): 1 page(s) are of type @foo/stamps:board, which is not in the catalog (kept as they are, not readable)",
    "W005 : book x2 (壊れた図面): it does not fit the shape of a book",
    "W006 : book x3 (双子): it breaks the rules of its lineup or of a page type",
  ])
})

test("機能台帳に無いアイテムと設定の項目は、ブックを読めるまま残し、warning W007 を付ける。あるのに選んでいない物を持つページは、形に合わない読めないページ（W028）で、ブックごと読めない", () => {
  const ok = SAMPLE_BOOKS[0]!
  const page = drawingPage("p1", { title: "P" })
  const star = { id: "s", item: "@foo/stars:star", x: 10, y: 10, props: { points: 5 } }
  const withStar = {
    ...ok,
    id: "y1",
    title: "星",
    lineup: [{ ...page, items: [star], settings: { "@foo/stars:sky": "night" } }],
  }
  const done = checkBooks(CORE_CATALOG, [withStar])
  expect(done.books).toHaveLength(1)
  expect(done.books[0]).toMatchObject({ lineup: [{ items: [star], settings: { "@foo/stars:sky": "night" } }] })
  expect(done.partial.map(warningText)).toEqual([
    "W007 @foo/stars: book y1 (星): it has @foo/stars:sky, @foo/stars:star, not in the catalog (kept as they are)",
  ])
  // 機能台帳にあって、図面が選んでいない設定の項目（ツリーの伸びる向き）と、項目の形が合わないアイテムを持つページは読めない
  const unselected = {
    ...ok,
    id: "y2",
    title: "選んでいない",
    lineup: [{ ...page, id: "p2", settings: { "@matomezu/tree:grow": "down" } }],
  }
  const misfit = {
    ...ok,
    id: "y3",
    title: "形違い",
    lineup: [{ ...page, id: "p3", items: [{ ...star, item: "@matomezu/box:shape-nest-box", props: { nope: 1 } }] }],
  }
  const read = checkBooks(CORE_CATALOG, [unselected, misfit])
  expect(read.books).toEqual([])
  expect(read.partial).toEqual([])
  expect(read.warnings.map(n => [n.code, n.params.book, n.params.pages])).toEqual([
    ["W028", "y2", "1"],
    ["W028", "y3", "1"],
  ])
})

test("子の形の中にある機能台帳に無いアイテムも W007 に出す（どの深さでも）", () => {
  const ok = SAMPLE_BOOKS[0]!
  const star = { id: "s", item: "@foo/stars:star", x: 4, y: 4, props: { points: 5 } }
  const moon = { id: "m", item: "@foo/stars:moon", x: 4, y: 4, props: {} }
  const nest = (id: string, shapes: object[]) => ({
    id,
    item: "@matomezu/box:shape-nest-box",
    x: 10,
    y: 10,
    w: 300,
    h: 200,
    props: {},
    shapes,
  })
  const page = drawingPage("p1", { title: "P" })
  const book = {
    ...ok,
    id: "z1",
    title: "入れ子",
    lineup: [{ ...page, items: [nest("a", [star, nest("b", [moon])])] }],
  }
  const done = checkBooks(CORE_CATALOG, [book])
  expect(done.books).toHaveLength(1)
  expect(done.partial.map(warningText)).toEqual([
    "W007 @foo/stars: book z1 (入れ子): it has @foo/stars:star, @foo/stars:moon, not in the catalog (kept as they are)",
  ])
})
