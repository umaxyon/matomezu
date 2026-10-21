import { describe, expect, test } from "bun:test"
import { newStage, openBook, openPage, panBy, paperOf, placement, resize } from "../../web/src/core/stage"
import { contentSize, MARGIN } from "../../web/src/core/viewport"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { REGISTRY } from "../support"

describe("stage", () => {
  const paged = {
    type: "drawing" as const,
    id: "b1",
    title: "見本",
    pages: [
      { id: "p1", title: "ページ 1", paper: "a4", orientation: "landscape" as const },
      { id: "p2", title: "ページ 2", paper: "a5", orientation: "portrait" as const },
    ],
  }
  const stage = openBook(REGISTRY, newStage("s1"), paged)
  const content = contentSize(paperOf(stage)!, 1)
  const small = { w: 400, h: 300 } // 中身が収まらない表示領域

  test("測る前は、ずらしても範囲に収めない（大きさが分からないので）", () => {
    expect(panBy(stage, -50, -60).pan).toEqual({ x: -50, y: -60 })
  })

  test("ずらす量は、いつも範囲に収めた値で持つ", () => {
    const s = resize(stage, small)
    expect(panBy(s, 100, 100).pan).toEqual({ x: 0, y: 0 })
    expect(panBy(s, -99999, -99999).pan).toEqual({ x: small.w - content.w, y: small.h - content.h })
  })

  test("表示領域が広がったら、ずらす量を収め直す（中身が収まれば真ん中）", () => {
    const panned = panBy(resize(stage, small), -200, -100)
    const wide = { w: content.w + 100, h: content.h + 40 }
    expect(resize(panned, wide).pan).toEqual({ x: 50, y: 20 })
  })

  test("同じ大きさ・動かない操作は、同じ値を返す", () => {
    const s = resize(stage, small)
    expect(resize(s, { ...small })).toBe(s)
    expect(panBy(s, 10, 10)).toBe(s)
    expect(openPage(REGISTRY, s, paged, "p1")).toBe(s)
    expect(openPage(REGISTRY, s, paged, "nope")).toBe(s)
  })

  test("ページを開くと、そのページの紙になり、ずらす量は最初の位置に戻る", () => {
    const s = panBy(resize(stage, small), -200, -100)
    const next = openPage(REGISTRY, s, paged, "p2")
    expect(next).toMatchObject({
      opened: { type: "drawing", book: "b1", page: "p2", paper: { status: "known", size: { w: 559, h: 794 } } },
      pan: { x: 0, y: 0 },
    })
    expect(paperOf(next)).toMatchObject({ w: 559, h: 794 })
  })

  test("紙は、ずらす量から余白の分だけ内側に置く", () => {
    const s = panBy(resize(stage, small), -30, -40)
    expect(placement(s)).toEqual({ x: MARGIN - 30, y: MARGIN - 40, ...paperOf(s)!, zoom: 1 })
  })

  test("何も開いていないステージは、紙が無く、ずらせない", () => {
    const empty = resize(newStage("s2"), small)
    expect(paperOf(empty)).toBeNull()
    expect(placement(empty)).toBeNull()
    expect(panBy(empty, -10, -10)).toBe(empty)
    expect(openPage(REGISTRY, empty, paged, "p1")).toBe(empty)
  })

  test("ブックを開くと、最初のページを開き、ずらす量は範囲に収めた最初の位置", () => {
    const book = {
      type: "drawing" as const,
      id: "b9",
      title: "見本",
      pages: [
        { id: "p4", title: "ページ 4", paper: "a4", orientation: "landscape" as const },
        { id: "p5", title: "ページ 5", paper: "a4", orientation: "landscape" as const },
      ],
    }
    const opened = openBook(REGISTRY, resize(newStage("s2"), small), book)
    expect(opened.opened).toEqual({
      type: "drawing",
      book: "b9",
      page: "p4",
      paper: { status: "known", size: { w: 1123, h: 794 } },
    })
    expect(opened.pan).toEqual({ x: 0, y: 0 })
  })

  test("ページの無いブックを開くと、ページも紙も開かず、ずらせない", () => {
    const opened = openBook(REGISTRY, resize(stage, small), { ...paged, id: "b0", pages: [] })
    expect(opened.opened).toEqual({ type: "drawing", book: "b0", page: null, paper: null })
    expect(placement(opened)).toBeNull()
    expect(panBy(opened, -10, -10)).toBe(opened)
  })

  test("マスターのブックを開くと、紙が無く、ずらせず、ページも開けない。もう一度開いても同じ値", () => {
    const master = openBook(REGISTRY, panBy(resize(stage, small), -30, -40), MASTER_BOOK)
    expect(master.opened).toEqual({ type: "master", book: "master", page: null, paper: null })
    expect(master.pan).toEqual({ x: 0, y: 0 })
    expect(paperOf(master)).toBeNull()
    expect(placement(master)).toBeNull()
    expect(panBy(master, -10, -10)).toBe(master)
    expect(openPage(REGISTRY, master, paged, "p1")).toBe(master)
    expect(openBook(REGISTRY, master, MASTER_BOOK)).toBe(master)
  })
})
