// 置き場所から読んだままの行を、機能台帳で読んだ書庫（readLibrary）: ブックの中はブックの読み方のまま、ブックの外のページとバインダも表に残す
import { expect, test } from "bun:test"
import { checkBooks, readLibrary } from "../../web/src/core/book"
import { HOME_ID, rawBooksOf, treeHolds } from "../../web/src/core/folders"
import type { AnyPage, UnreadableEntry } from "../../web/src/core/schema/book"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, worldRows } from "../support"

const UNKNOWN = "@foo/stamps:board"
const stranger = (id: string, title = id, type = UNKNOWN) => ({ ...drawingPage(id), type, title }) as never as AnyPage
const connector = { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} }
const unreadable = (id: string, title: string, code: UnreadableEntry["code"], type: string): UnreadableEntry => ({
  kind: "unreadable",
  id,
  title,
  code,
  type,
})
const read = (rows: { pages: unknown[]; folders: unknown[] }) => readLibrary(CORE_CATALOG, rows.pages, rows.folders)
const book = () => testBook("b1", "ブック", [drawingPage("p1"), stranger("u1", "U")])

test("ブックの中は checkBooks と同じに読み、ブックの外のページは、読めるならタイプの形で読んだページのまま表に残す。木の決まりは守られる", () => {
  const rows = worldRows([book()], [drawingPage("x1", { title: "外" })])
  const done = read(rows)
  const checked = checkBooks(CORE_CATALOG, rawBooksOf(rows.pages, rows.folders))
  expect(done.books).toEqual(checked.books)
  expect(done.warnings).toEqual(checked.warnings)
  expect(done.partial).toEqual(checked.partial)
  expect(done.outsideWarnings).toEqual([])
  expect(done.library.pages.x1).toEqual(drawingPage("x1", { title: "外" }))
  expect(Object.keys(done.library.pages).sort()).toEqual(["p1", "u1", "x1"])
  expect(treeHolds(done.library)).toBe(true)
})

test("読めないブックの外のページ（タイプが機能台帳に無い・形に合わない・決まりを守らない）は、読めないページのエントリで表に残り、warning はブックの外の全体で理由ごとに 1 つ（ブックの id と名前は無い）", () => {
  const rows = worldRows(
    [],
    [
      stranger("x1"),
      stranger("x2"),
      stranger("x3", "x3", "@bar/other:t"),
      drawingPage("x4", { settings: { "@matomezu/tree:grow": "down" } } as never),
      drawingPage("x5", { title: "線", items: [connector] } as never),
    ],
  )
  const done = read(rows)
  expect(["x1", "x3", "x4", "x5"].map(id => done.library.pages[id])).toEqual([
    unreadable("x1", "x1", "W027", UNKNOWN),
    unreadable("x3", "x3", "W027", "@bar/other:t"),
    unreadable("x4", "ページ 1", "W028", "@matomezu/drawing:drawing"),
    unreadable("x5", "線", "W029", "@matomezu/drawing:drawing"),
  ])
  expect(done.outsideWarnings.map(w => [w.code, w.plugin, w.params])).toEqual([
    ["W027", "@foo/stamps", { pages: "2", type: UNKNOWN }],
    ["W027", "@bar/other", { pages: "1", type: "@bar/other:t" }],
    ["W028", "", { pages: "1" }],
    ["W029", "", { pages: "1" }],
  ])
  expect(treeHolds(done.library)).toBe(true)
})

test("機能台帳に無いアイテムを持つブックの外のページは読め、warning W007 はブックの外の全体で 1 つ", () => {
  const box = (id: string, item: string) => ({ id, item, x: 0, y: 0, props: {} })
  const rows = worldRows(
    [],
    [
      drawingPage("x1", { items: [box("a", "@foo/stamps:stamp")] } as never),
      drawingPage("x2", { title: "2", items: [box("b", "@foo/stamps:seal")] } as never),
    ],
  )
  const done = read(rows)
  expect(done.library.pages.x1?.kind).toBe("page")
  expect(done.outsideWarnings.map(w => [w.code, w.plugin, w.params])).toEqual([
    ["W007", "@foo/stamps", { missing: "@foo/stamps:stamp, @foo/stamps:seal" }],
  ])
})

test("ブックの外のバインダは、バインダの決まりを守れば中のページごと表に入る（中の読めないページも入る）", () => {
  const binder = testBinder("lb", "束", SLIDE, testPage(SLIDE, "y1", { title: "1" }), stranger("y2", "2"))
  const done = read(worldRows([], [binder]))
  expect(done.library.folders.lb).toEqual({
    folderRole: "binder",
    id: "lb",
    title: "束",
    pageType: SLIDE,
    lineup: [
      { kind: "page", id: "y1" },
      { kind: "page", id: "y2" },
    ],
  })
  expect(done.library.pages.y2).toEqual(unreadable("y2", "2", "W027", UNKNOWN))
  expect(done.outsideWarnings.map(w => w.code)).toEqual(["W027"])
  expect(treeHolds(done.library)).toBe(true)
})

test("ブックの外のバインダが、中のページの行を欠く・紙と向きがそろわない・中で名前が重なるなら、中のページごと表に入れず、木の決まりが破れて見える", () => {
  const slide = (id: string, rest: object = {}) => testPage(SLIDE, id, { title: id, ...rest })
  const cases = [
    { name: "欠く", binder: testBinder("lb", "束", SLIDE, slide("y1"), slide("y2")), drop: "y2" },
    { name: "紙", binder: testBinder("lb", "束", SLIDE, slide("y1"), slide("y2", { orientation: "portrait" })) },
    { name: "名前", binder: testBinder("lb", "束", SLIDE, slide("y1"), slide("y2", { title: "y1" })) },
  ]
  for (const c of cases) {
    const rows = worldRows([], [c.binder, drawingPage("x1")])
    const pages = c.drop ? rows.pages.filter(p => (p as { id: string }).id !== c.drop) : rows.pages
    const done = readLibrary(CORE_CATALOG, pages, rows.folders)
    expect([c.name, "lb" in done.library.folders, "y1" in done.library.pages]).toEqual([c.name, false, false])
    expect([c.name, done.library.pages.x1?.kind]).toEqual([c.name, "page"])
    expect([c.name, treeHolds(done.library)]).toEqual([c.name, false])
  }
})

test("同じフォルダに直に入るブックの外のページは、名前が重なっても、紙が違っても、読めるまま表に残る（名前の重なりは、変えるアクションが断る）", () => {
  const rows = worldRows(
    [testBook("b1", "外", [drawingPage("p1")])],
    [drawingPage("x1", { title: "外" }), drawingPage("x2", { title: "外", orientation: "portrait" })],
  )
  const done = read(rows)
  expect([done.library.pages.x1?.kind, done.library.pages.x2?.kind]).toEqual(["page", "page"])
  expect(treeHolds(done.library)).toBe(true)
})

test("並びが表に無い行を指すと、その行は表に入らず、木の決まりが破れて見える。どのフォルダにも持たれていないページの行は、表に入れない", () => {
  const rows = worldRows([], [drawingPage("x1"), drawingPage("x2", { title: "2" })])
  const missing = read({ pages: rows.pages.filter(p => (p as { id: string }).id !== "x2"), folders: rows.folders })
  expect(Object.keys(missing.library.pages)).toEqual(["x1"])
  expect(treeHolds(missing.library)).toBe(false)
  const loose = read({ pages: [...rows.pages, drawingPage("z1")], folders: rows.folders })
  expect("z1" in loose.library.pages).toBe(false)
  expect(treeHolds(loose.library)).toBe(true)
})

test("読めないブックのページの行は、ブックの外のページにならず表に入らない（ブックを指す並びは、表に無いブックも通す）", () => {
  const broken = testBook("b2", "壊", [drawingPage("q1"), drawingPage("q2", { title: "ページ 1" })])
  const rows = worldRows([book(), broken], [drawingPage("x1")])
  const done = read(rows)
  expect(done.warnings.map(w => [w.code, w.params.book])).toEqual([["W006", "b2"]])
  expect(["q1", "q2"].some(id => id in done.library.pages)).toBe(false)
  expect(done.library.folders[HOME_ID]?.lineup.map(r => r.id)).toEqual(["b1", "b2", "x1"])
  expect(treeHolds(done.library)).toBe(true)
})

test("書庫ホームもフォルダも無ければ、読めるブックの表だけ", () => {
  const rows = worldRows([book()])
  const done = readLibrary(
    CORE_CATALOG,
    rows.pages,
    rows.folders.filter(f => (f as { id: string }).id !== HOME_ID),
  )
  expect(Object.keys(done.library.folders)).toEqual(["b1"])
  expect(done.outsideWarnings).toEqual([])
})
