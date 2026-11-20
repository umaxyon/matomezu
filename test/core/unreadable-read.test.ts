// 読めない物を読む: 読めないページ（タイプが無い W027・タイプの形に合わない W028・タイプの決まりを守らない W029）か、タイプが無いバインダ（W027）を持つブックは、ブックごと読めない。
// ブックの外の読めないページと、読めないページを持つブックの外のバインダは、書庫の表に入らない。残したデータには手を付けない
// （読めない物は常駐が読めない物のフォルダへ移すので、これが起きるのは、移す前か、画面にだけ組めないプラグインが在るとき）

import { describe, expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { checkBooks, readLibrary } from "../../web/src/core/book"
import { performIn, type World } from "../../web/src/core/perform"
import { warningText } from "../../web/src/core/warnings"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { DRAWING, drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, sequence, worldRows } from "../support"

const UNKNOWN = "@foo/stamps:board"
// タイプが機能台帳に無いページ（残したデータの形）
const stranger = (id: string, title: unknown = id) => ({ ...drawingPage(id), type: UNKNOWN, title }) as never
const connector = { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} }

describe("残したブックを読む（checkBooks）", () => {
  test("タイプが無いページを持つブックは、ブックごと読めない（W027。無いタイプと枚数を持ち、持ち主のプラグインは無い）", () => {
    const saved = testBook("b1", "B", [
      stranger("u1"),
      drawingPage("p1"),
      testBinder("f1", "スライド", SLIDE, testPage(SLIDE, "s1"), stranger("u2")),
    ])
    const read = checkBooks(CORE_CATALOG, [saved])
    expect(read.books).toEqual([])
    expect(read.warnings.map(n => [n.code, n.plugin, n.params])).toEqual([
      ["W027", "", { book: "b1", title: "B", pages: "2", type: UNKNOWN }],
    ])
    expect(warningText(read.warnings[0]!)).toContain(UNKNOWN)
  })

  test("タイプの形に合わないページは W028、タイプの決まりを守らないページ（線の端が無い）は W029 で、ブックごと読めない", () => {
    const misfit = { ...drawingPage("p1"), items: "x" } as never
    const broken = drawingPage("p2", { items: [connector] } as never)
    const read = checkBooks(CORE_CATALOG, [testBook("b1", "B", [misfit]), testBook("b2", "C", [broken])])
    expect(read.books).toEqual([])
    expect(read.warnings.map(n => [n.code, n.params.book])).toEqual([
      ["W028", "b1"],
      ["W029", "b2"],
    ])
  })

  test("タイプが無いバインダを持つブックは、ブックごと読めない（W027。中のページは数えない）", () => {
    const binder = { ...testBinder("f1", "スタンプ", SLIDE, testPage(SLIDE, "s1")), pageType: UNKNOWN }
    const read = checkBooks(CORE_CATALOG, [testBook("b1", "B", [binder as never])])
    expect(read.books).toEqual([])
    expect(read.warnings.map(n => [n.code, n.params.pages, n.params.type])).toEqual([["W027", "1", UNKNOWN]])
  })

  test("読めるページだけのブックは読める", () => {
    expect(checkBooks(CORE_CATALOG, [testBook("b1", "B", [drawingPage("p1")])]).books.map(b => b.id)).toEqual(["b1"])
  })
})

describe("置き場所の行を読む（readLibrary）", () => {
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "en" as const,
    newId: sequence("n"),
    now: "2026-01-01T00:00:00.000Z",
    actor: USER,
  }

  test("読めないページを持つブックは書庫の表に入らず、名指したアクションは no-book で断られる。ほかのブックには行える", () => {
    const rows = worldRows([
      testBook("b1", "B", [drawingPage("p1"), stranger("u1")]),
      testBook("b2", "C", [drawingPage("p2")]),
    ])
    const read = readLibrary(CORE_CATALOG, rows.pages, rows.folders)
    expect(Object.keys(read.library.folders)).not.toContain("b1")
    expect(Object.keys(read.library.pages)).not.toContain("p1")
    const world: World = { ...read.library, settings: {}, annotations: {}, records: {}, counters: {} }
    const run = (book: string) =>
      performIn(world, "@matomezu/base:book-update", { title: "改" }, { book } as never, ctx as never)
    expect(run("b1")).toEqual({ ok: false, reason: "no-book" })
    expect(run("b2").ok).toBe(true)
  })

  test("ブックの外の読めないページと、読めないページを持つブックの外のバインダは表に入らず、warning に理由ごとに 1 つ出る", () => {
    const rows = worldRows(
      [],
      [
        stranger("x1"),
        testPage(DRAWING, "x2"),
        testBinder("f1", "スライド", SLIDE, testPage(SLIDE, "s1"), stranger("u2")),
      ],
    )
    const read = readLibrary(CORE_CATALOG, rows.pages, rows.folders)
    expect(Object.keys(read.library.pages).sort()).toEqual(["x2"])
    expect(Object.keys(read.library.folders)).not.toContain("f1")
    expect(read.outsideWarnings.map(n => [n.code, n.params.pages, n.params.type])).toEqual([["W027", "2", UNKNOWN]])
  })
})
