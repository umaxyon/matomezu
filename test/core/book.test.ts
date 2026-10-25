import { describe, expect, test } from "bun:test"
import { addPage, addsFromTabs, choosablePapers, createBook, defaultPaper, paperChoices } from "../../web/src/core/book"
import { resolvePaper } from "../../web/src/core/paper"
import { PAPER_IDS } from "../../web/src/plugins/base"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { CORE_CATALOG } from "../support"

const book = {
  type: "drawing" as const,
  id: "b1",
  title: "ブック",
  pages: [
    { id: "p1", title: "ページ 1", paper: "a4", orientation: "landscape" as const },
    { id: "p3", title: "ページ 3", paper: "a3", orientation: "portrait" as const },
  ],
}

test("ページを足すと、振った id で、決めた名前と紙のページになる。ほかのページと重なる id は振り直す", () => {
  const ids = ["p3", "p-2a"]
  const { book: next, page } = addPage(
    book,
    { title: "表紙", paper: "a5", orientation: "portrait" },
    () => ids.shift()!,
  )
  expect(page).toEqual({ id: "p2a", title: "表紙", paper: "a5", orientation: "portrait" })
  expect(next.pages.map(p => p.id)).toEqual(["p1", "p3", "p2a"])
  expect(book.pages).toHaveLength(2)
})

test("作ったブックは、そのタイプの形の空のブック", () => {
  const made = createBook(CORE_CATALOG, "drawing", { id: "x", title: "新しい図" })
  expect(made).toEqual({ type: "drawing", id: "x", title: "新しい図", pages: [] })
  expect(CORE_CATALOG.bookSchema.safeParse(made).success).toBe(true)
})

describe("紙の規定（図面はページごとに選べる）", () => {
  test("どのページでも、規定の紙を全部選べ、既定は A4 横", () => {
    expect(paperChoices(CORE_CATALOG, book)).toEqual({ papers: PAPER_IDS, orientations: ["portrait", "landscape"] })
    expect(defaultPaper(CORE_CATALOG, { ...book, pages: [] })).toEqual({ paper: "a4", orientation: "landscape" })
  })

  test("1 冊の紙をそろえる規定では、最初のページは規定から選び、後のページは最初のページの紙だけ", () => {
    const rule = {
      allowed: ["a4", "a3"],
      default: "a4",
      orientation: "landscape" as const,
      perPage: false,
    }
    expect(choosablePapers(rule, [])).toEqual({ papers: ["a4", "a3"], orientations: ["portrait", "landscape"] })
    expect(choosablePapers(rule, [{ id: "p1", title: "1", paper: "a3", orientation: "portrait" }])).toEqual({
      papers: ["a3"],
      orientations: ["portrait"],
    })
  })

  test("図面は、タブの横でページを足せる。マスターはページを持たない", () => {
    expect(addsFromTabs(CORE_CATALOG, book)).toBe(true)
    expect(addsFromTabs(CORE_CATALOG, MASTER_BOOK)).toBe(false)
  })
})

test("ブックの形に無い項目は誤り。形はタイプで決まる", () => {
  const ok = {
    type: "drawing",
    id: "b1",
    title: "ブック",
    pages: [{ id: "p1", title: "ページ 1", paper: "a4", orientation: "landscape" }],
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
  expect(CORE_CATALOG.bookSchema.safeParse({ type: "master", id: "master" }).success).toBe(true)
  expect(CORE_CATALOG.bookSchema.safeParse({ type: "master", id: "master", pages: ok.pages }).success).toBe(false)
})

describe("ページの紙を描く大きさ", () => {
  test("表にある紙は、その大きさを向きに合わせて描く", () => {
    expect(resolvePaper(CORE_CATALOG, { paper: "a4", orientation: "landscape" })).toEqual({
      status: "known",
      size: { w: 1123, h: 794 },
    })
    expect(resolvePaper(CORE_CATALOG, { paper: "a4", orientation: "portrait" })).toEqual({
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
