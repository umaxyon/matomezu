import { describe, expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import {
  areaOf,
  closePrintPreview,
  folderOf,
  followBook,
  newStage,
  openBook,
  openedPage,
  openFolder,
  openPage,
  openPrintPreview,
  panBy,
  paperOf,
  placement,
  resetView,
  resize,
  select,
  setArea,
  setEditing,
  setStart,
  shownPageId,
  toPaper,
  zoomTo,
} from "../../web/src/core/stage"
import { contentSize, MARGIN } from "../../web/src/core/viewport"
import { drawingPage, pagesBook, SLIDE, testBook, testFolder, testPage, withPages } from "../lineup"
import { CORE_CATALOG } from "../support"

describe("stage", () => {
  const paged = pagesBook({
    type: "@matomezu/drawing:drawing" as const,
    id: "b1",
    title: "見本",
    pages: [
      { id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" as const },
      { id: "p2", title: "ページ 2", paper: "@matomezu/base:a5", orientation: "portrait" as const },
    ],
  })
  const stage = openBook(CORE_CATALOG, newStage("s1"), paged)
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
    expect(openPage(CORE_CATALOG, s, paged, "p1")).toBe(s)
    expect(openPage(CORE_CATALOG, s, paged, "nope")).toBe(s)
  })

  test("ページを開くと、そのページの紙になり、ずらす量は最初の位置に戻る", () => {
    const s = panBy(resize(stage, small), -200, -100)
    const next = openPage(CORE_CATALOG, s, paged, "p2")
    expect(next).toMatchObject({
      opened: {
        type: "@matomezu/drawing:drawing",
        book: "b1",
        page: "p2",
        paper: { status: "known", size: { w: 559, h: 794 } },
      },
      pan: { x: 0, y: 0 },
    })
    expect(paperOf(next)).toMatchObject({ w: 559, h: 794 })
  })

  test("紙は、ずらす量から余白の分だけ内側に置く", () => {
    const s = panBy(resize(stage, small), -30, -40)
    expect(placement(s)).toEqual({ x: MARGIN - 30, y: MARGIN - 40, ...paperOf(s)!, zoom: 1 })
  })

  test("倍率を変えても、渡した点（無ければ表示領域の真ん中）の下の紙の点は動かない。開いたときの見え方に戻せる", () => {
    const s = panBy(resize(stage, small), -200, -100)
    const at = { x: 120, y: 80 }
    const under = toPaper(s, at)
    const big = zoomTo(s, 1.25, at)
    expect(big.zoom).toBe(1.25)
    expect(toPaper(big, at)).toEqual(under)
    const mid = { x: small.w / 2, y: small.h / 2 }
    expect(toPaper(zoomTo(s, 0.75), mid)).toEqual(toPaper(s, mid))
    expect(zoomTo(s, 1)).toBe(s)
    const home = resetView(big)
    expect(home).toMatchObject({ zoom: 1, pan: { x: 0, y: 0 } })
    expect(resetView(home)).toBe(home)
  })

  test("何も開いていないステージは、紙が無く、ずらせない", () => {
    const empty = resize(newStage("s2"), small)
    expect(paperOf(empty)).toBeNull()
    expect(placement(empty)).toBeNull()
    expect(panBy(empty, -10, -10)).toBe(empty)
    expect(openPage(CORE_CATALOG, empty, paged, "p1")).toBe(empty)
  })

  test("ブックを開くと、最初のページを開き、ずらす量は範囲に収めた最初の位置", () => {
    const book = pagesBook({
      type: "@matomezu/drawing:drawing" as const,
      id: "b9",
      title: "見本",
      pages: [
        { id: "p4", title: "ページ 4", paper: "@matomezu/base:a4", orientation: "landscape" as const },
        { id: "p5", title: "ページ 5", paper: "@matomezu/base:a4", orientation: "landscape" as const },
      ],
    })
    const opened = openBook(CORE_CATALOG, resize(newStage("s2"), small), book)
    expect(opened.opened).toEqual({
      kind: "page",
      type: "@matomezu/drawing:drawing",
      book: "b9",
      page: "p4",
      paper: { status: "known", size: { w: 1123, h: 794 } },
    })
    expect([opened.pan, opened.starting]).toEqual([{ x: 0, y: 0 }, true])
  })

  test("ページの無いブックを開くと、ページも紙も開かず、ずらせない", () => {
    const opened = openBook(CORE_CATALOG, resize(stage, small), withPages({ ...paged, id: "b0" }, []))
    expect(opened.opened).toEqual({ kind: "none", book: "b0" })
    expect(placement(opened)).toBeNull()
    expect(panBy(opened, -10, -10)).toBe(opened)
  })
})

test("その場で編集中（editing）は、選んでいる物があるときだけ始められ、選びが替わると終わる", () => {
  const stage = newStage("s1")
  expect(setEditing(stage, true).editing).toBe(false) // 何も選んでいない
  const picked = select(stage, ["a"])
  const editing = setEditing(picked, true)
  expect(editing.editing).toBe(true)
  expect(select(editing, ["a"]).editing).toBe(true) // 同じ選びなら続く
  expect(select(editing, ["b"]).editing).toBe(false)
  expect(setEditing(editing, false).editing).toBe(false)
})

test("見せ方が知らせた広さ（可変ページ）は、紙の枠とずらす量の範囲に効き、紙 1 枚の大きさ（paperOf）は変えない。紙が変われば捨てる", () => {
  const book = pagesBook({
    type: "@matomezu/drawing:drawing" as const,
    id: "b1",
    title: "見本",
    pages: [{ id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "portrait" as const }],
  })
  const opened = resize(openBook(CORE_CATALOG, newStage("s1"), book), { w: 400, h: 300 })
  const sheet = paperOf(opened)!
  expect(areaOf(opened)).toEqual(sheet)
  const area = { w: sheet.w, h: sheet.h * 3 }
  const grown = setArea(opened, area)
  expect(paperOf(grown)).toEqual(sheet)
  expect(areaOf(grown)).toEqual(area)
  expect(placement(grown)).toMatchObject({ w: area.w, h: area.h })
  // 下へは、3 枚分の広さまでずらせる
  expect(panBy(grown, 0, -100000).pan.y).toBe(300 - contentSize(area, 1).h)
  // 同じ広さなら同じ値。null で紙 1 枚に戻し、ずらす量も収め直す
  expect(setArea(grown, { ...area })).toBe(grown)
  const back = setArea(panBy(grown, 0, -100000), null)
  expect(areaOf(back)).toEqual(sheet)
  expect(back.pan.y).toBe(300 - contentSize(sheet, 1).h)
  // 開いているページの紙が変われば、知らせた広さは捨てる（知らせ直すまで紙 1 枚）
  const a3 = withPages(book, [{ ...pagesOf(book)[0]!, paper: "@matomezu/base:a3" }])
  expect(areaOf(followBook(CORE_CATALOG, grown, a3))).toEqual(paperOf(followBook(CORE_CATALOG, grown, a3)))
})

test("開いているページの中身をずらした（ページの shift が変わった）なら、中身が同じ所に見えるようパンを合わせ、知らせた広さも先に広げる", () => {
  const page = { id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "portrait" as const }
  const book = pagesBook({
    type: "@matomezu/drawing:drawing" as const,
    id: "b1",
    title: "見本",
    pages: [page],
  })
  const sheet = paperOf(openBook(CORE_CATALOG, newStage("s1"), book))!
  const view = { w: 400, h: 300 }
  const start = setArea(resize(openBook(CORE_CATALOG, newStage("s1"), book), view), { w: sheet.w * 3, h: sheet.h * 3 })
  const at = panBy(start, -sheet.w, -sheet.h) // 2 つ目の印刷区画の左上あたりを見ている
  // 右へ印刷区画 1 つ分、下へは動かさずにずらす
  const shifted = followBook(CORE_CATALOG, at, withPages(book, [{ ...page, shift: { x: 1, y: 0 } }]))
  expect(shifted.pan).toEqual({ x: at.pan.x - sheet.w, y: at.pan.y })
  expect(areaOf(shifted)).toEqual({ w: sheet.w * 4, h: sheet.h * 3 })
  // 詰めて戻せば、パンも戻る
  const back = followBook(CORE_CATALOG, shifted, book)
  expect(back.pan).toEqual(at.pan)
  // ずらしていなければ同じ値
  expect(followBook(CORE_CATALOG, back, book)).toBe(back)
})

test("位置をデータに持たない見せ方が、描く中身をずらした量（origin）を広さと一緒に知らせて変われば、中身が同じ所に見えるようパンを合わせる", () => {
  const page = { id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "portrait" as const }
  const book = pagesBook({
    type: "@matomezu/drawing:drawing" as const,
    id: "b1",
    title: "見本",
    pages: [page],
  })
  const sheet = paperOf(openBook(CORE_CATALOG, newStage("s1"), book))!
  const view = { w: 400, h: 300 }
  const area = { w: sheet.w * 3, h: sheet.h * 2 }
  const start = setArea(resize(openBook(CORE_CATALOG, newStage("s1"), book), view), area, { x: 1, y: 0 })
  const at = panBy(start, -sheet.w, 0)
  // 左へ印刷区画 1 つ分あふれて、右へ印刷区画 2 つ分ずらすことになった
  const moved = setArea(at, { w: sheet.w * 4, h: sheet.h * 2 }, { x: 2, y: 0 })
  expect(moved.pan).toEqual({ x: at.pan.x - sheet.w, y: at.pan.y })
  expect(openedPage(moved.opened ?? null)?.origin).toEqual({ x: 2, y: 0 })
  // 同じ広さとずらした量なら同じ値。紙 1 枚に戻せば、ずらした量も無くなる
  expect(setArea(moved, { w: sheet.w * 4, h: sheet.h * 2 }, { x: 2, y: 0 })).toBe(moved)
  expect(openedPage(setArea(moved, null).opened ?? null)?.origin).toBeUndefined()
})

test("開いたばかりのページは、知らせた初めの位置（start）を表示領域の左上に置く。紙の左上でなければ広さが届くまで待ち、動かしたあとや開き直すまでは合わせない", () => {
  const page = { id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "portrait" as const }
  const book = pagesBook({
    type: "@matomezu/drawing:drawing" as const,
    id: "b1",
    title: "見本",
    pages: [page],
  })
  const view = { w: 400, h: 300 }
  const opened = resize(openBook(CORE_CATALOG, newStage("s1"), book), view)
  const sheet = paperOf(opened)!
  const area = { w: sheet.w * 3, h: sheet.h * 2 }
  const start = { x: sheet.w, y: sheet.h }
  // 初めの位置が先に届いても、広さが届くまでは動かさない
  const early = setStart(opened, start)
  expect([early.pan, early.starting]).toEqual([{ x: 0, y: 0 }, true])
  const reached = setArea(early, area)
  expect([reached.pan, reached.starting]).toEqual([{ x: -sheet.w, y: -sheet.h }, false])
  // 広さが先でも同じ所
  expect(setStart(setArea(opened, area), start).pan).toEqual(reached.pan)
  // 合わせたあとは、知らせが変わっても動かさない。戻せば、今の初めの位置へ
  const later = setStart(panBy(reached, 100, 100), { x: sheet.w * 2, y: 0 })
  expect(later.pan).toEqual({ x: -sheet.w + 100, y: -sheet.h + 100 })
  expect(resetView(later).pan).toEqual({ x: -sheet.w * 2, y: 0 })
  // 合わせる前に動かせば、合わせない
  const panned = panBy(opened, -10, -10)
  expect(setStart(setArea(panned, area), start).pan).toEqual({ x: -10, y: -10 })
  // 紙の左上なら、広さを待たずに印を消す
  expect(setStart(opened, { x: 0, y: 0 }).starting).toBe(false)
  // 開き直せば、また合わせる
  const reopened = openBook(CORE_CATALOG, { ...newStage("s1"), view }, book)
  expect(setStart(setArea(reopened, area), start).pan).toEqual(reached.pan)
})

test("開いていたページが無くなって隣のページを開いたときも初めの位置に合わせる。印刷プレビューを開けば合わせず、印刷プレビューの間に戻すと並べた広さの左上", () => {
  const p1 = { id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "portrait" as const }
  const p2 = { ...p1, id: "p2", title: "ページ 2" }
  const book = pagesBook({
    type: "@matomezu/drawing:drawing" as const,
    id: "b1",
    title: "見本",
    pages: [p1, p2],
  })
  const view = { w: 400, h: 300 }
  const opened = resize(openBook(CORE_CATALOG, newStage("s1"), book), view)
  const sheet = paperOf(opened)!
  const area = { w: sheet.w * 2, h: sheet.h * 2 }
  const start = { x: sheet.w, y: sheet.h }
  const settledAt = panBy(setStart(setArea(opened, area), start), 50, 50)
  const removed = followBook(CORE_CATALOG, settledAt, withPages(book, [p2]), book)
  expect([shownPageId(removed.opened ?? null), removed.starting, removed.pan]).toEqual(["p2", true, { x: 0, y: 0 }])
  expect(setStart(setArea(removed, area), start).pan).toEqual({ x: -sheet.w, y: -sheet.h })
  // 印刷プレビューを開けば印を下ろし、閉じて知らせが届いても合わせない
  const previewed = openPrintPreview(opened)
  expect(previewed.starting).toBe(false)
  expect(setStart(setArea(closePrintPreview(previewed), area), start).pan).toEqual({ x: 0, y: 0 })
  // 印刷プレビューの間に戻すと、並べた広さの左上
  const reached = setStart(setArea(opened, area), start)
  expect(resetView(panBy(openPrintPreview(reached), -10, -10)).pan).toEqual({ x: 0, y: 0 })
})

describe("フォルダ（スライド）を開く", () => {
  const slide = (id: string) => testPage(SLIDE, id, { title: id, paper: "@matomezu/base:ratio-16x9" })
  const book = testBook("b1", "混ざる", [
    drawingPage("p1"),
    testFolder("f1", "スライド", SLIDE, slide("s1"), slide("s2"), slide("s3")),
    testFolder("f2", "空", SLIDE),
  ])
  const at = (page: string) => openPage(CORE_CATALOG, openBook(CORE_CATALOG, newStage("s1"), book), book, page)

  test("フォルダを開くと中の最初のページ、空のフォルダならフォルダを開く", () => {
    const opened = openBook(CORE_CATALOG, newStage("s1"), book)
    expect(shownPageId(openFolder(CORE_CATALOG, opened, book, "f1").opened ?? null)).toBe("s1")
    expect(openFolder(CORE_CATALOG, opened, book, "f2").opened).toEqual({
      kind: "folder",
      book: "b1",
      folder: "f2",
      type: SLIDE,
    })
    expect(folderOf(book, at("s2").opened ?? null)).toBe("f1")
    expect(folderOf(book, at("p1").opened ?? null)).toBeNull()
    // 並びの最初がフォルダなら、その最初のページを開く
    const first = testBook("b2", "スライドだけ", [testFolder("f1", "スライド", SLIDE, slide("s1"))])
    expect(shownPageId(openBook(CORE_CATALOG, newStage("s1"), first).opened ?? null)).toBe("s1")
  })

  test("フォルダの中のページが無くなれば、同じフォルダの後ろ、無ければ前のページ。全部無くなればフォルダ（空）", () => {
    const without = (...ids: string[]) =>
      testBook("b1", "混ざる", [
        drawingPage("p1"),
        testFolder("f1", "スライド", SLIDE, ...["s1", "s2", "s3"].filter(i => !ids.includes(i)).map(slide)),
        testFolder("f2", "空", SLIDE),
      ])
    expect(shownPageId(followBook(CORE_CATALOG, at("s2"), without("s2"), book).opened ?? null)).toBe("s3")
    expect(shownPageId(followBook(CORE_CATALOG, at("s3"), without("s3"), book).opened ?? null)).toBe("s2")
    expect(followBook(CORE_CATALOG, at("s1"), without("s1", "s2", "s3"), book).opened).toMatchObject({
      kind: "folder",
      folder: "f1",
    })
  })

  test("空のフォルダを開いていて、ページが入ればそのページを開く。フォルダが無くなれば並びの最初", () => {
    const empty = openFolder(CORE_CATALOG, openBook(CORE_CATALOG, newStage("s1"), book), book, "f2")
    const filled = testBook("b1", "混ざる", [...book.lineup.slice(0, 2), testFolder("f2", "空", SLIDE, slide("s9"))])
    expect(shownPageId(followBook(CORE_CATALOG, empty, filled, book).opened ?? null)).toBe("s9")
    const gone = testBook("b1", "混ざる", book.lineup.slice(0, 2))
    expect(shownPageId(followBook(CORE_CATALOG, empty, gone, book).opened ?? null)).toBe("p1")
  })
})
