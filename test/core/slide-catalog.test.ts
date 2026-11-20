// ページの slide（形だけの並び）の土台の扱い: 台帳アセンブルの誤り（E042・E043）、読み込み（W007・W028）、置けるアイテムの一本化（attach・テーマキー・ツールボックス）

import { expect, test } from "bun:test"
import { checkBooks } from "../../web/src/core/book"
import { checkCoreCatalog } from "../../web/src/core/core-catalog"
import { attachedTo } from "../../web/src/core/def/action"
import { placeableOf } from "../../web/src/core/def/page-type"
import { warningText } from "../../web/src/core/warnings"
import { tokenDefsOf } from "../../web/src/plugins/base/book-look/look"
import { itemMinimapMarks } from "../../web/src/plugins/base/minimap/marks"
import { filledSheets } from "../../web/src/plugins/base/print-preview/filled"
import { toolboxOf } from "../../web/src/plugins/base/toolbox/toolbox"
import { SLIDE, testBinder, testBook, testPage, withSlide } from "../lineup"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

const slideType = BUILTIN_PARTS.pageTypes.find(t => t.id === SLIDE)!
const TEXT = "@matomezu/slide:slide-text"
const page = testPage(SLIDE, "p1", { title: "P", paper: "@matomezu/base:ratio-16x9" })
const bookWith = (slide: object[]) => testBook("s1", "S", [testBinder("s1-slides", "S", SLIDE, withSlide(page, slide))])

test("slide に置けるのは形だけ（E042）", () => {
  const withLine = { ...slideType, slide: { allowed: ["@matomezu/line:connector-line"] } }
  const parts = (t: typeof slideType) => ({
    ...BUILTIN_PARTS,
    pageTypes: BUILTIN_PARTS.pageTypes.map(b => (b === slideType ? t : b)),
  })
  expect(checkCoreCatalog(parts(withLine)).map(p => p.code)).toContain("E042")
})

test("slide のアイテムは、機能台帳に無ければ W007 で残し、allowed に無い形を持つページは形に合わない読めないページ（W028。ブックごと読めない）", () => {
  const text = { id: "t", item: TEXT, x: 0, y: 0, w: 100, h: 40, props: { text: "a" } }
  const star = { id: "s", item: "@foo/stars:star", x: 0, y: 0, props: {} }
  expect(checkCoreCatalog(BUILTIN_PARTS)).toEqual([])
  const kept = checkBooks(CORE_CATALOG, [bookWith([text, star])])
  expect(kept.books).toHaveLength(1)
  expect(kept.partial.map(warningText)).toEqual([
    "W007 @foo/stars: book s1 (S): it has @foo/stars:star, not in the catalog (kept as they are)",
  ])
  const box = { id: "b", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: {} }
  const misfit = checkBooks(CORE_CATALOG, [bookWith([box])])
  expect(misfit.books).toEqual([])
  expect(misfit.warnings.map(w => w.code)).toEqual(["W028"])
})

test("置けるアイテムは items.allowed と slide.allowed の合わせ: アクションの attach・テーマキー・ツールボックスが同じ物を見る", () => {
  expect(placeableOf(slideType)).toEqual(slideType.slide!.allowed)
  const update = BUILTIN_PARTS.actions.find(a => a.id === "@matomezu/slide:slide-update")!
  expect(attachedTo(update, slideType)).toBe(true)
  const drawing = BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/drawing:drawing")!
  expect(attachedTo(update, drawing)).toBe(true) // 図面は背景（slide）を持つ
  const markdown = BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/markdown:markdown")!
  expect(attachedTo(update, markdown)).toBe(false)
  // slide にだけ置けるアイテムのテーマキーも、タイプの宣言に入る
  const box = BUILTIN_PARTS.items.find(i => i.id === "@matomezu/list:shape-list")!
  expect(box.tokens.length).toBeGreaterThan(0)
  const onlySlide = { ...drawing, items: { ...drawing.items, allowed: [] }, slide: { allowed: [box.id] } }
  const ids = tokenDefsOf(CORE_CATALOG, onlySlide).map(d => d.id)
  for (const t of box.tokens) expect(ids).toContain(t.id)
  expect(toolboxOf(CORE_CATALOG, SLIDE, "items")).toEqual(slideType.slide!.allowed as never)
})

test("ミニマップと印刷区画の既定は、ページの slide の形も数える（形の定義の minimap。無いなら置いた四角）", () => {
  const ellipse = {
    id: "e",
    item: "@matomezu/slide:slide-ellipse",
    x: 10,
    y: 20,
    w: 100,
    h: 50,
    props: {},
  }
  const line = {
    id: "l",
    item: "@matomezu/slide:slide-line",
    x: 0,
    y: 0,
    w: 200,
    h: 100,
    props: { to: { x: 1, y: 0.5 } },
  }
  const text = { id: "t", item: TEXT, x: 5, y: 6, w: 40, h: 30, props: { text: "a" } }
  const p = { ...page, slide: [ellipse, line, text] } as never
  expect(
    itemMinimapMarks(CORE_CATALOG, p, { setting: () => undefined as never, grow: undefined, drawn: () => undefined }),
  ).toEqual([
    { kind: "ellipse", x: 10, y: 20, w: 100, h: 50 },
    {
      kind: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 50 },
      ],
    },
    { kind: "rect", x: 5, y: 6, w: 40, h: 30 },
  ])
  expect(filledSheets(CORE_CATALOG, { ...page, slide: [text] } as never)?.size).toBe(1)
  expect(filledSheets(CORE_CATALOG, { ...page, slide: [] } as never)?.size).toBe(0)
})
