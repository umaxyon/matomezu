import { describe, expect, test } from "bun:test"
import { addPage, choosablePapers, createBook, defaultPaper, paperChoices } from "../../web/src/core/book"
import { resolvePaper } from "../../web/src/core/paper"
import { PAPER_IDS } from "../../web/src/plugins/base"
import { CORE_CATALOG } from "../support"

const book = {
  type: "@matomezu/drawing:drawing" as const,
  id: "b1",
  title: "ブック",
  pages: [
    { id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" as const },
    { id: "p3", title: "ページ 3", paper: "@matomezu/base:a3", orientation: "portrait" as const },
  ],
}

test("ページを足すと、振った id で、決めた名前と紙のページになる。ほかのページと重なる id は振り直す", () => {
  const ids = ["p3", "p-2a"]
  const { book: next, page } = addPage(
    book,
    { title: "表紙", paper: "@matomezu/base:a5", orientation: "portrait" },
    () => ids.shift()!,
  )
  expect(page).toEqual({ id: "p2a", title: "表紙", paper: "@matomezu/base:a5", orientation: "portrait" })
  expect(next.pages.map(p => p.id)).toEqual(["p1", "p3", "p2a"])
  expect(book.pages).toHaveLength(2)
})

test("作ったブックは、そのタイプの形の空のブック", () => {
  const made = createBook(CORE_CATALOG, "@matomezu/drawing:drawing", { id: "x", title: "新しい図" })
  expect(made).toEqual({ type: "@matomezu/drawing:drawing", id: "x", title: "新しい図", pages: [] })
  expect(CORE_CATALOG.bookSchema.safeParse(made).success).toBe(true)
})

describe("紙の規定（図面はページごとに選べる）", () => {
  test("どのページでも、規定の紙を全部選べ、既定は A4 横", () => {
    expect(paperChoices(CORE_CATALOG, book)).toEqual({ papers: PAPER_IDS, orientations: ["portrait", "landscape"] })
    expect(defaultPaper(CORE_CATALOG, { ...book, pages: [] })).toEqual({
      paper: "@matomezu/base:a4",
      orientation: "landscape",
    })
  })

  test("1 冊の紙をそろえる規定では、最初のページは規定から選び、後のページは最初のページの紙だけ", () => {
    const rule = {
      allowed: ["@matomezu/base:a4", "@matomezu/base:a3"],
      default: "@matomezu/base:a4",
      orientation: "landscape" as const,
      perPage: false,
    }
    expect(choosablePapers(rule, [])).toEqual({
      papers: ["@matomezu/base:a4", "@matomezu/base:a3"],
      orientations: ["portrait", "landscape"],
    })
    expect(
      choosablePapers(rule, [{ id: "p1", title: "1", paper: "@matomezu/base:a3", orientation: "portrait" }]),
    ).toEqual({
      papers: ["@matomezu/base:a3"],
      orientations: ["portrait"],
    })
  })
})

test("ブックの形に無い項目は誤り。形はタイプで決まる", () => {
  const ok = {
    type: "@matomezu/drawing:drawing",
    id: "b1",
    title: "ブック",
    pages: [{ id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" }],
  }
  expect(CORE_CATALOG.bookSchema.safeParse(ok).success).toBe(true)
  expect(CORE_CATALOG.bookSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false)
  expect(CORE_CATALOG.bookSchema.safeParse({ ...ok, pages: [] }).success).toBe(true)
  expect(CORE_CATALOG.bookSchema.safeParse({ ...ok, pages: [{ id: "p1", title: "ページ 1" }] }).success).toBe(false)
  // 表に無い紙の id も受け取る（描き方は resolvePaper）。向きは決まった値だけ
  expect(CORE_CATALOG.bookSchema.safeParse({ ...ok, pages: [{ ...ok.pages[0], paper: "b5" }] }).success).toBe(true)
  expect(CORE_CATALOG.bookSchema.safeParse({ ...ok, pages: [{ ...ok.pages[0], orientation: "up" }] }).success).toBe(
    false,
  )
  expect(CORE_CATALOG.bookSchema.safeParse({ id: "b1", title: "ブック", pages: ok.pages }).success).toBe(false)
  expect(
    CORE_CATALOG.bookSchema.safeParse({ type: "@matomezu/master:master", id: "@matomezu/master:master" }).success,
  ).toBe(true)
  expect(
    CORE_CATALOG.bookSchema.safeParse({
      type: "@matomezu/master:master",
      id: "@matomezu/master:master",
      pages: ok.pages,
    }).success,
  ).toBe(false)
})

describe("ページの紙を描く大きさ", () => {
  test("表にある紙は、その大きさを向きに合わせて描く", () => {
    expect(resolvePaper(CORE_CATALOG, { paper: "@matomezu/base:a4", orientation: "landscape" })).toEqual({
      status: "known",
      size: { w: 1123, h: 794 },
    })
    expect(resolvePaper(CORE_CATALOG, { paper: "@matomezu/base:a4", orientation: "portrait" })).toEqual({
      status: "known",
      size: { w: 794, h: 1123 },
    })
  })

  test("表に無い紙は、表で一番大きい紙で描いて不明とする。中身が入らなければ描けない", () => {
    const unknown = { paper: "b5", orientation: "landscape" as const }
    expect(resolvePaper(CORE_CATALOG, unknown)).toEqual({ status: "unknown", size: { w: 1587, h: 1123 } })
    expect(resolvePaper(CORE_CATALOG, unknown, { w: 1500, h: 1000 })).toEqual({
      status: "unknown",
      size: { w: 1587, h: 1123 },
    })
    expect(resolvePaper(CORE_CATALOG, unknown, { w: 2000, h: 1000 })).toEqual({ status: "unshowable" })
  })
})
