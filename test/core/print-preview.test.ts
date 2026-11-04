import { describe, expect, test } from "bun:test"
import {
  closePrintPreview,
  extentOf,
  newStage,
  openBook,
  openPage,
  openPrintPreview,
  panBy,
  resize,
  select,
  setPreviewArea,
  stageBlocks,
  zoomTo,
} from "../../web/src/core/stage"
import { arrangeSheets } from "../../web/src/plugins/base/print-preview/sheets"
import { CORE_CATALOG } from "../support"

const book = {
  type: "@matomezu/drawing:drawing" as const,
  id: "b1",
  title: "見本",
  pages: [
    { id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" as const },
    { id: "p2", title: "ページ 2", paper: "@matomezu/base:a5", orientation: "portrait" as const },
  ],
}

describe("ステージの印刷プレビュー", () => {
  const editing = zoomTo(resize(openBook(CORE_CATALOG, newStage("s1"), book), { w: 400, h: 300 }), 1.25)
  const opened = openPrintPreview(editing)
  const area = { w: 1200, h: 3000 }

  test("開くと選択を捨て、並べた広さを知らせるまでは、ずらせない", () => {
    const picked = openPrintPreview(select(editing, ["a"]))
    expect(picked.mode.kind).toBe("print-preview")
    expect(picked.selection).toEqual([])
    expect(extentOf(opened)).toBeNull()
    expect(panBy(opened, -10, -10)).toBe(opened)
  })

  test("広さを知らせると、ずらす量をその範囲に収める。広さが変わっても、範囲の中ならずらす量はそのまま", () => {
    const shown = setPreviewArea(opened, area)
    expect(extentOf(shown)).toEqual(area)
    const moved = panBy(shown, 0, -100)
    expect(setPreviewArea(moved, { w: 1200, h: 3200 }).pan).toEqual(moved.pan)
  })

  test("印刷プレビューの間は、選ぶ・その場の編集を始めない", () => {
    const shown = setPreviewArea(opened, area)
    expect(select(shown, ["a"])).toBe(shown)
  })

  test("閉じると、開く前の倍率とずらす量に戻る。ページを開けば、そのページの編集になる", () => {
    const shown = zoomTo(setPreviewArea(opened, area), 0.5)
    const closed = closePrintPreview(shown)
    expect(closed.mode.kind).toBe("edit")
    expect({ zoom: closed.zoom, pan: closed.pan }).toEqual({ zoom: editing.zoom, pan: editing.pan })
    const other = openPage(CORE_CATALOG, shown, book, "p2")
    expect(other.mode.kind).toBe("edit")
    expect(other.opened?.page).toBe("p2")
    expect(other.zoom).toBe(editing.zoom)
    expect(openPage(CORE_CATALOG, shown, book, "p1").mode.kind).toBe("edit")
  })

  test("ブックを開き直せば、印刷プレビューは閉じる", () => {
    expect(openBook(CORE_CATALOG, opened, book).mode.kind).toBe("edit")
  })

  test("印刷プレビューの間に止めるのは、ブックが対象で、印刷プレビューの間も行う印の無いアクション", () => {
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/paper:item-place")).toBe(true)
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/base:book-revert")).toBe(true)
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/base:print-preview-update")).toBe(false)
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/base:book-lock")).toBe(false)
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/base:settings-set")).toBe(false)
    expect(stageBlocks(CORE_CATALOG, "edit", "@matomezu/paper:item-place")).toBe(false)
  })
})

describe("印刷区画の並べ方", () => {
  const a4 = { w: 300, h: 200 }
  const a5 = { w: 100, h: 150 }
  const pages = [
    { page: "p1", paper: a4, columns: 2, rows: 2 },
    { page: "p2", paper: a5, columns: 1, rows: 1 },
  ]
  const cells = (layout: ReturnType<typeof arrangeSheets>) => layout.sheets.map(s => `${s.page}:${s.column}${s.row}`)

  test("縦に並べるときは、上から順に間を空けて置き、横はいちばん大きい紙の真ん中にそろえる", () => {
    const layout = arrangeSheets(pages, { flow: "column", order: "across", gap: 10 })
    expect(cells(layout)).toEqual(["p1:00", "p1:10", "p1:01", "p1:11", "p2:00"])
    expect(layout.sheets.map(s => [s.x, s.y, s.index])).toEqual([
      [0, 0, 0],
      [0, 210, 1],
      [0, 420, 2],
      [0, 630, 3],
      [100, 840, 4],
    ])
    expect(layout.size).toEqual({ w: 300, h: 990 })
  })

  test("横に並べるときは、左から順に置き、縦をそろえる。縦に進むのが先なら、列ごとに数える", () => {
    const layout = arrangeSheets(pages, { flow: "row", order: "down", gap: 0 })
    expect(cells(layout)).toEqual(["p1:00", "p1:01", "p1:10", "p1:11", "p2:00"])
    expect(layout.sheets.map(s => [s.x, s.y])).toEqual([
      [0, 0],
      [300, 0],
      [600, 0],
      [900, 0],
      [1200, 25],
    ])
    expect(layout.size).toEqual({ w: 1300, h: 200 })
  })

  test("外した印刷区画は並べず、ページの印刷区画がどれも外れたら最初の 1 つを白紙として並べる", () => {
    const layout = arrangeSheets(pages, {
      flow: "column",
      order: "across",
      shown: (page, column, row) => page === "p1" && column === 1 && row === 1,
    })
    expect(cells(layout)).toEqual(["p1:11", "p2:00"])
  })

  test("ページが無ければ、何も並べない", () => {
    expect(arrangeSheets([], { flow: "column", order: "across" })).toEqual({ sheets: [], size: { w: 0, h: 0 } })
  })
})
