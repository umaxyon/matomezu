// ページの slide（形だけの並び）の土台の扱い: 機能台帳の組み立ての誤り（E042・E043）、読み込み（W005・W007）、置けるアイテムの一本化（attach・テーマキー・ツールボックス）
import { expect, test } from "bun:test"
import { checkBooks } from "../../web/src/core/book"
import { checkCoreCatalog } from "../../web/src/core/core-catalog"
import { attachedTo } from "../../web/src/core/def/action"
import { placeableOf } from "../../web/src/core/def/book-type"
import { tokenDefsOf } from "../../web/src/core/theme"
import { warningText } from "../../web/src/core/warnings"
import { toolboxOf } from "../../web/src/plugins/base/toolbox/toolbox"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

const SLIDE_TYPE = "@matomezu/slide-book:slide"
const slideType = BUILTIN_PARTS.bookTypes.find(t => t.id === SLIDE_TYPE)!
const TEXT = "@matomezu/slide:slide-text"
const page = { id: "p1", title: "P", paper: "@matomezu/base:wide", orientation: "landscape" as const }
const bookWith = (slide: object[]) => ({
  type: SLIDE_TYPE,
  id: "s1",
  title: "S",
  project: "default",
  pages: [{ ...page, slide }],
})

test("slide に置けるのは形だけ（E042）で、ページを持たないタイプは slide を持てない（E043）", () => {
  const withLine = { ...slideType, slide: { allowed: ["@matomezu/line:connector-line"] } }
  const parts = (t: typeof slideType) => ({
    ...BUILTIN_PARTS,
    bookTypes: BUILTIN_PARTS.bookTypes.map(b => (b === slideType ? t : b)),
  })
  expect(checkCoreCatalog(parts(withLine)).map(p => p.code)).toContain("E042")
  expect(checkCoreCatalog(parts({ ...slideType, pages: null })).map(p => p.code)).toContain("E043")
})

test("slide のアイテムは、機能台帳に無ければ W007 で残し、allowed に無い形は読めない（W005）", () => {
  const text = { id: "t", item: TEXT, x: 0, y: 0, w: 100, h: 40, props: { text: "a" } }
  const star = { id: "s", item: "@foo/stars:star", x: 0, y: 0, props: {} }
  expect(checkCoreCatalog(BUILTIN_PARTS)).toEqual([])
  const kept = checkBooks(CORE_CATALOG, [bookWith([text, star])])
  expect(kept.books).toHaveLength(1)
  expect(kept.partial.map(warningText)).toEqual([
    "W007 @foo/stars: book s1 (S): it has @foo/stars:star, not in the catalog (kept as they are)",
  ])
  const box = { id: "b", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: {} }
  expect(checkBooks(CORE_CATALOG, [bookWith([box])]).warnings.map(w => w.code)).toEqual(["W005"])
})

test("置けるアイテムは items.allowed と slide.allowed の合わせ: アクションの attach・テーマキー・ツールボックスが同じ物を見る", () => {
  expect(placeableOf(slideType)).toEqual(slideType.slide!.allowed)
  const update = BUILTIN_PARTS.actions.find(a => a.id === "@matomezu/slide:slide-update")!
  expect(attachedTo(update, slideType)).toBe(true)
  const drawing = BUILTIN_PARTS.bookTypes.find(t => t.id === "@matomezu/drawing:drawing")!
  expect(attachedTo(update, drawing)).toBe(false)
  // slide にだけ置けるアイテムのテーマキーも、タイプの宣言に入る
  const box = BUILTIN_PARTS.items.find(i => i.id === "@matomezu/list:shape-list")!
  expect(box.tokens.length).toBeGreaterThan(0)
  const onlySlide = { ...drawing, items: { ...drawing.items, allowed: [] }, slide: { allowed: [box.id] } }
  const ids = tokenDefsOf(CORE_CATALOG, onlySlide).map(d => d.id)
  for (const t of box.tokens) expect(ids).toContain(t.id)
  const book = { type: SLIDE_TYPE } as never
  expect(toolboxOf(CORE_CATALOG, book)).toEqual(slideType.slide!.allowed as never)
})
