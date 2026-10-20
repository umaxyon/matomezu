import { describe, expect, test } from "bun:test"
import {
  addPage,
  addsFromTabs,
  choosablePapers,
  defaultPaper,
  MASTER_BOOK,
  paperChoices,
} from "../../web/src/core/book"
import { createBook } from "../../web/src/core/book-types"
import { PAPER_NAMES } from "../../web/src/core/paper"
import { BookSchema } from "../../web/src/core/schema/book"

const book = {
  type: "drawing" as const,
  id: "b1",
  title: "ブック",
  pages: [
    { id: "p1", title: "ページ 1", paper: "a4-landscape" as const },
    { id: "p3", title: "ページ 3", paper: "a3-portrait" as const },
  ],
}

test("ページを足すと、使っていない一番小さい番号の id で、決めた名前と紙のページになる", () => {
  const { book: next, page } = addPage(book, { title: "表紙", paper: "a5-portrait" })
  expect(page).toEqual({ id: "p2", title: "表紙", paper: "a5-portrait" })
  expect(next.pages.map(p => p.id)).toEqual(["p1", "p3", "p2"])
  expect(book.pages).toHaveLength(2)
})

test("作ったブックは、そのタイプの形の空のブック", () => {
  const made = createBook("drawing", { id: "x", title: "新しい図" })
  expect(made).toEqual({ type: "drawing", id: "x", title: "新しい図", pages: [] })
  expect(BookSchema.safeParse(made).success).toBe(true)
})

describe("紙の規定（図面はページごとに選べる）", () => {
  test("どのページでも、規定の紙を全部選べ、既定は A4 横", () => {
    expect(paperChoices(book)).toEqual(PAPER_NAMES)
    expect(defaultPaper({ ...book, pages: [] })).toBe("a4-landscape")
  })

  test("1 冊の紙をそろえる規定では、最初のページは規定から選び、後のページは最初のページの紙だけ", () => {
    const rule = {
      allowed: ["a4-landscape", "a3-landscape"] as const,
      default: "a4-landscape" as const,
      perPage: false,
    }
    expect(choosablePapers(rule, [])).toEqual(["a4-landscape", "a3-landscape"])
    expect(choosablePapers(rule, [{ id: "p1", title: "1", paper: "a3-landscape" }])).toEqual(["a3-landscape"])
  })

  test("図面は、タブの横でページを足せる。マスターはページを持たない", () => {
    expect(addsFromTabs(book)).toBe(true)
    expect(addsFromTabs(MASTER_BOOK)).toBe(false)
  })
})

test("ブックの形に無い項目は誤り。形はタイプで決まる", () => {
  const ok = {
    type: "drawing",
    id: "b1",
    title: "ブック",
    pages: [{ id: "p1", title: "ページ 1", paper: "a4-landscape" }],
  }
  expect(BookSchema.safeParse(ok).success).toBe(true)
  expect(BookSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false)
  expect(BookSchema.safeParse({ ...ok, pages: [] }).success).toBe(true)
  expect(BookSchema.safeParse({ ...ok, pages: [{ id: "p1", title: "ページ 1" }] }).success).toBe(false)
  expect(BookSchema.safeParse({ ...ok, pages: [{ id: "p1", title: "ページ 1", paper: "b5" }] }).success).toBe(false)
  expect(BookSchema.safeParse({ id: "b1", title: "ブック", pages: ok.pages }).success).toBe(false)
  expect(BookSchema.safeParse({ type: "master", id: "master" }).success).toBe(true)
  expect(BookSchema.safeParse({ type: "master", id: "master", pages: ok.pages }).success).toBe(false)
})
