// 常駐のエンジンが AI に見せるページ: ページ 1 枚の入口（read_page）は、ブックの中のページでも、ブックをまとめて読む入口（read_book）と同じ物を答える
import { expect, test } from "bun:test"
import "../../web/src/engine/engine"
import { pagesOf } from "../../web/src/core/book"
import {
  DIR,
  drawingPage,
  FLOWCHART,
  MARKDOWN,
  SLIDE,
  TREE,
  testBinder,
  testBook,
  testPage,
  withSlide,
} from "../lineup"

const engine = globalThis as unknown as {
  matomezuAiPlaced(book: string): string
  matomezuAiPagePlaced(page: string): string
  matomezuAiPage(page: string): string
}
const BOX = "@matomezu/box:shape-nest-box"
const box = (id: string, x: number, shapes: object[] = []) => ({
  id,
  x,
  y: 20,
  item: BOX,
  w: 64,
  h: 64,
  props: { caption: id, rule: true, body: "", captionAlign: "center", bodyAlign: "left" },
  ...(shapes.length > 0 ? { shapes } : {}),
})
const text = (id: string) => ({
  id,
  item: "@matomezu/slide:slide-text",
  x: 1,
  y: 2,
  w: 300,
  h: 40,
  props: { text: "社外秘" },
})

const book = testBook("b1", "ブック", [
  drawingPage("p1", { title: "p1", items: [box("a", 10, [box("c", 8)]), box("b", 400)] } as never),
  withSlide(drawingPage("p2", { title: "p2" }), [text("t1")]),
  testPage(FLOWCHART, "p3", { title: "p3" }),
  testPage(TREE, "p4", {
    title: "p4",
    root: { id: "r", caption: "根", children: [{ id: "k", caption: "子", children: [] }] },
  }),
  testPage(DIR, "p5", {
    title: "p5",
    root: { id: "d", kind: "folder", name: "proj", children: [{ id: "f", kind: "file", name: "a.ts" }] },
  } as never),
  testPage(MARKDOWN, "p6", { title: "p6" }),
  testBinder("n1", "スライド", SLIDE, testPage(SLIDE, "s1", { title: "s1" }), testPage(SLIDE, "s2", { title: "s2" })),
])

test("ページ 1 枚の placed は、どのタイプのページでも（バインダの中も）、ブックをまとめて読んだ placed のそのページの分と同じ", () => {
  const all = JSON.parse(engine.matomezuAiPlaced(JSON.stringify(book))) as Record<string, unknown>
  const pages = pagesOf(book)
  expect(pages.map(p => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "s1", "s2"])
  expect(Object.keys(all)).toEqual(pages.map(p => p.id))
  for (const page of pages) expect(JSON.parse(engine.matomezuAiPagePlaced(JSON.stringify(page)))).toEqual(all[page.id])
  expect(all.p1).toHaveLength(3)
})

test("読めないページの placed は null、AI に見せるページは渡したまま", () => {
  const broken = JSON.stringify({ ...drawingPage("x"), items: 1 })
  expect(engine.matomezuAiPagePlaced(broken)).toBe("null")
  expect(engine.matomezuAiPagePlaced(JSON.stringify({ id: "x", type: "nope" }))).toBe("null")
  expect(engine.matomezuAiPage(broken)).toBe(broken)
})

test("背景を持つタイプのページは、背景の形を見せず、その文字だけを background に入れる（スライドのページはそのまま）", () => {
  const drawing = JSON.parse(engine.matomezuAiPage(JSON.stringify(pagesOf(book)[1])))
  expect(drawing.slide).toBeUndefined()
  expect(drawing.background).toEqual({ texts: ["社外秘"] })
  const slide = JSON.stringify(withSlide(testPage(SLIDE, "s1"), [text("t2")]))
  expect(engine.matomezuAiPage(slide)).toBe(slide)
})
