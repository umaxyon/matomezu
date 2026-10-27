import { expect, test } from "bun:test"
import { checkBooks } from "../../web/src/core/book"
import { warningText } from "../../web/src/core/warnings"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { CORE_CATALOG } from "../support"

test("読めるブックと、読めないブックの warning（タイプが無い W004・形に合わない W005・決まりを守らない W006）に分ける", () => {
  const ok = SAMPLE_BOOKS[0]!
  const noType = { type: "@foo/stamps:board", id: "x1", title: "スタンプ帳" }
  const misfit = { ...ok, id: "x2", title: "壊れた図面", pages: "?" }
  const page = { id: "p1", title: "P", paper: "@matomezu/base:a4", orientation: "landscape" as const }
  const line = { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} }
  const broken = { ...ok, id: "x3", title: "線だけ", pages: [{ ...page, items: [line] }] }
  const done = checkBooks(CORE_CATALOG, [ok, noType, misfit, broken])
  expect(done.books.map(b => b.id)).toEqual([ok.id])
  expect(done.warnings.map(warningText)).toEqual([
    "W004 @foo/stamps: book x1 (スタンプ帳): its type @foo/stamps:board is not in the catalog",
    "W005 @matomezu/drawing: book x2 (壊れた図面): it does not fit its type @matomezu/drawing:drawing",
    "W006 @matomezu/drawing: book x3 (線だけ): it breaks the rules of its type @matomezu/drawing:drawing",
  ])
})

test("機能台帳に無いアイテムと設定の項目は、ブックを読めるまま残し、warning W007 を付ける。あるのに選んでいない物は読めない", () => {
  const ok = SAMPLE_BOOKS[0]!
  const page = { id: "p1", title: "P", paper: "@matomezu/base:a4", orientation: "landscape" as const }
  const star = { id: "s", item: "@foo/stars:star", x: 10, y: 10, props: { points: 5 } }
  const withStar = {
    ...ok,
    id: "y1",
    title: "星",
    settings: { "@foo/stars:sky": "night" },
    pages: [{ ...page, items: [star] }],
  }
  const done = checkBooks(CORE_CATALOG, [withStar])
  expect(done.books).toHaveLength(1)
  expect(done.books[0]).toMatchObject({ settings: { "@foo/stars:sky": "night" }, pages: [{ items: [star] }] })
  expect(done.partial.map(warningText)).toEqual([
    "W007 @foo/stars: book y1 (星): it has @foo/stars:sky, @foo/stars:star, not in the catalog (kept as they are)",
  ])
  // 機能台帳にあって、図面が選んでいない設定の項目（ページのテーマ）と、項目の形が合わないアイテムは読めない
  const unselected = {
    ...ok,
    id: "y2",
    title: "選んでいない",
    pages: [{ ...page, settings: { "@matomezu/base:book-theme": "x" } }],
  }
  const misfit = {
    ...ok,
    id: "y3",
    title: "形違い",
    pages: [{ ...page, items: [{ ...star, item: "@matomezu/box:shape-box", props: { nope: 1 } }] }],
  }
  expect(checkBooks(CORE_CATALOG, [unselected, misfit]).warnings.map(n => n.code)).toEqual(["W005", "W005"])
})
