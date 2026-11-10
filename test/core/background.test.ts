// 背景（ページの slide。背景を持つタイプ）: 本体か背景かの判定、直している並びとステージの背景編集モード、印刷区画とミニマップの扱い
import { expect, test } from "bun:test"
import { slideIsBackground } from "../../web/src/core/def/book-type"
import {
  editingBackground,
  endBackground,
  newStage,
  openBook,
  openPage,
  openPrintPreview,
  startBackground,
} from "../../web/src/core/stage"
import { minimapMarks } from "../../web/src/plugins/base/minimap/marks"
import { sheetsOfPage } from "../../web/src/plugins/base/print-preview/book-sheets"
import { placeableIn } from "../../web/src/plugins/base/toolbox/toolbox"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

const typeOf = (id: string) => BUILTIN_PARTS.bookTypes.find(t => t.id === id)!
const DRAWING = "@matomezu/drawing:drawing"
const SLIDE = "@matomezu/slide-book:slide"
const ELLIPSE = "@matomezu/slide:slide-ellipse"
const backdrop = { id: "bg", item: ELLIPSE, x: 10, y: 10, w: 100, h: 60, props: {} }
const pages = [
  { id: "p1", title: "1", paper: "@matomezu/base:a4", orientation: "landscape" as const, slide: [backdrop] },
  { id: "p2", title: "2", paper: "@matomezu/base:a4", orientation: "landscape" as const, slide: [backdrop] },
]
const book = (type: string, extra: object = {}) =>
  ({ type, id: "b1", title: "B", project: "default", pages, ...extra }) as never

test("slide が背景か本体かは、タイプが slide に background を書いたかで決まる。直している並びで置ける物が変わる", () => {
  expect(slideIsBackground(typeOf(DRAWING))).toBe(true)
  expect(slideIsBackground(typeOf("@matomezu/flowchart:flowchart"))).toBe(true)
  expect(slideIsBackground(typeOf(SLIDE))).toBe(false)
  expect(slideIsBackground(typeOf("@matomezu/markdown:markdown"))).toBe(false) // slide を持たない
  const drawing = typeOf(DRAWING)
  expect(placeableIn(drawing, "slide")).toEqual(drawing.slide!.allowed)
  expect(placeableIn(drawing, "items")).toEqual(drawing.items.allowed)
  expect(placeableIn(typeOf(SLIDE), "items")).toEqual(typeOf(SLIDE).slide!.allowed) // 本体は、どちらの並びでも slide
})

test("背景編集モードには、背景を持つタイプのページを開いている間だけ入れる。入ると選択と置こうとしている物を捨てる", () => {
  const open = (type: string) => openBook(CORE_CATALOG, newStage("s1"), book(type))
  expect(editingBackground(startBackground(CORE_CATALOG, open(DRAWING)))).toBe(true)
  expect(editingBackground(startBackground(CORE_CATALOG, open(SLIDE)))).toBe(false) // 本体のタイプには無い
  expect(startBackground(CORE_CATALOG, newStage("s1")).edits).toBe("items") // 何も開いていない
  const busy = { ...open(DRAWING), selection: ["x"], placing: ELLIPSE as never }
  const entered = startBackground(CORE_CATALOG, busy)
  expect(entered.selection).toEqual([])
  expect(entered.placing).toBeNull()
  const left = endBackground({ ...entered, selection: ["bg"] })
  expect(left.edits).toBe("items")
  expect(left.selection).toEqual([])
})

test("背景編集モードの間は、ページを替えない。印刷プレビューを開いて閉じても残り、別のブックを開くと抜ける", () => {
  const b = book(DRAWING)
  const entered = startBackground(CORE_CATALOG, openBook(CORE_CATALOG, newStage("s1"), b))
  expect(openPage(CORE_CATALOG, entered, b, "p2")).toBe(entered)
  expect(openPrintPreview(entered).edits).toBe("slide")
  expect(openBook(CORE_CATALOG, entered, b).edits).toBe("items")
  expect(openPage(CORE_CATALOG, endBackground(entered), b, "p2").opened?.page).toBe("p2")
})

test("背景だけの印刷区画は載らない（auto）。印刷対象が always なら中身が無くても載り、never でも auto と同じに載らない", () => {
  const sheetsFor = (setting?: string) => {
    const page = { ...pages[0], ...(setting ? { settings: { "@matomezu/base:background-print": setting } } : {}) }
    return sheetsOfPage(CORE_CATALOG, book(DRAWING, { pages: [page] }), page as never)
  }
  expect(sheetsFor()?.filled).toEqual(new Set())
  expect(sheetsFor("always")?.filled).toBeNull()
  expect(sheetsFor("never")?.filled).toEqual(new Set())
})

test("ミニマップには背景を描かない", () => {
  const b = book(DRAWING)
  expect(minimapMarks(CORE_CATALOG, b, pages[0] as never)).toEqual([])
})

test("可変ページで背景を必ず印刷するときは、背景だけの印刷区画も並べる（背景が中身の外枠の外にあっても数える）", () => {
  const far = { id: "far", item: ELLIPSE, x: 1300, y: 900, w: 100, h: 60, props: {} }
  const page = {
    id: "p1",
    title: "1",
    paper: "@matomezu/base:a4",
    orientation: "landscape" as const,
    grows: true as const,
    items: [],
    slide: [far],
  }
  const sheetsFor = (setting?: string) => {
    const b = book(DRAWING, {
      pages: [page],
      ...(setting ? { settings: { "@matomezu/base:background-print": setting } } : {}),
    })
    return sheetsOfPage(CORE_CATALOG, b, page as never)
  }
  const always = sheetsFor("always")
  expect(always?.filled).toBeNull()
  expect(always?.columns).toBeGreaterThanOrEqual(2)
  expect(always?.rows).toBeGreaterThanOrEqual(2)
  const auto = sheetsFor()
  expect(auto?.columns).toBe(1)
  expect(auto?.rows).toBe(1)
})
