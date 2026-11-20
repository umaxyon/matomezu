// ステージの印刷プレビュー（core/stage の開く・閉じる・ずらす・広さ）
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
  shownPageId,
  stageBlocks,
  zoomTo,
} from "../../web/src/core/stage"
import { MARGIN } from "../../web/src/core/viewport"
import { fitSideView, ZOOM_MAX } from "../../web/src/plugins/base/zoom"
import { drawingPage, testBook } from "../lineup"
import { CORE_CATALOG } from "../support"

const book = testBook("b1", "見本", [
  drawingPage("p1"),
  drawingPage("p2", { title: "ページ 2", paper: "@matomezu/base:a5", orientation: "portrait" }),
])

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

  test("幅に合わせると、幅が余白 24px を残して入る倍率にし、横は真ん中、縦は始めを余白の所に置く。高さに合わせるときは向きを入れ替える。倍率は下限から上限まで", () => {
    const shown = setPreviewArea(opened, area)
    const wide = fitSideView(resize(shown, { w: 1000, h: 300 }), "width")
    expect(wide.zoom).toBe(0.79) // (1000 - 48) / 1200
    expect(wide.pan.y + MARGIN).toBe(24)
    const tall = fitSideView(resize(shown, { w: 400, h: 300 }), "height")
    expect(tall.zoom).toBe(0.3) // (300 - 48) / 3000 は下限より小さい
    expect(fitSideView(setPreviewArea(opened, { w: 100, h: 100 }), "width").zoom).toBe(ZOOM_MAX)
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
    expect(shownPageId(other.opened ?? null)).toBe("p2")
    expect(other.zoom).toBe(editing.zoom)
    expect(openPage(CORE_CATALOG, shown, book, "p1").mode.kind).toBe("edit")
  })

  test("ブックを開き直せば、印刷プレビューは閉じる", () => {
    expect(openBook(CORE_CATALOG, opened, book).mode.kind).toBe("edit")
  })

  test("印刷プレビューの間に止めるのは、ブックが対象で、印刷プレビューの間も行う印の無いアクション", () => {
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/paper:item-place")).toBe(true)
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/base:page-update")).toBe(true)
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/base:print-preview-update")).toBe(false)
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/base:book-lock")).toBe(false)
    expect(stageBlocks(CORE_CATALOG, "print-preview", "@matomezu/base:settings-set")).toBe(false)
    expect(stageBlocks(CORE_CATALOG, "edit", "@matomezu/paper:item-place")).toBe(false)
  })
})
