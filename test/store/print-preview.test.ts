import { expect, test } from "bun:test"
import type { PagedBook } from "../../web/src/core/book"
import { paperSize } from "../../web/src/plugins/base/place/items"
import { placedSize } from "../../web/src/plugins/base/place/placed"
import { bookSheets } from "../../web/src/plugins/base/print-preview/book-sheets"
import { filledSheets, sheetsOfShape } from "../../web/src/plugins/base/print-preview/filled"
import { isEnabled, isShown } from "../../web/src/store/commands"
import { newStore } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
const settled = () => Promise.resolve()
const stageOf = (store: ReturnType<typeof newStore>) => store.state.getState().workspace.stages[0]!
const bookOf = (store: ReturnType<typeof newStore>) => store.state.getState().books.b1 as { settings?: object }

function previewing() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: BOX, at: { x: 40, y: 40 }, props: { caption: "箱" } },
    { book: "b1" },
  )
  expect(store.actions.command("s1", "@matomezu/base:print-preview-open")).toBe(true)
  return store
}

test("開くコマンドで印刷プレビューになる。印刷プレビューの間は、開くコマンドを出さない", () => {
  const store = previewing()
  expect(stageOf(store).mode.kind).toBe("print-preview")
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/base:print-preview-open")).toBe(false)
})

test("印刷プレビューの間は、ブックを変えるコマンド（元に戻すも）が押せない。閉じれば押せる", async () => {
  const store = previewing()
  await settled()
  const state = () => store.state.getState()
  expect(isEnabled(store, state(), "s1", "@matomezu/base:undo")).toBe(false)
  expect(isEnabled(store, state(), "s1", "@matomezu/base:page-new")).toBe(false)
  expect(isEnabled(store, state(), "s1", "@matomezu/base:zoom-in")).toBe(true)
  store.actions.closePrintPreview("s1")
  expect(isEnabled(store, state(), "s1", "@matomezu/base:undo")).toBe(true)
})

test("印刷プレビューの設定は print-preview-update で変え、画面の履歴に入らない。book-update では変えられない", async () => {
  const store = previewing()
  await settled()
  const undo = () => store.state.getState().history.b1?.undo.length
  const before = undo()
  const done = store.actions.perform(
    "@matomezu/base:print-preview-update",
    { settings: { "@matomezu/base:print-preview-flow": "row" } },
    { book: "b1" },
  )
  await settled()
  expect(done.ok).toBe(true)
  expect(bookOf(store).settings).toEqual({ "@matomezu/base:print-preview-flow": "row" })
  expect(undo()).toBe(before)
  const refused = store.actions.perform(
    "@matomezu/base:book-update",
    { settings: { "@matomezu/base:print-preview-flow": "column" } },
    { book: "b1" },
  )
  expect(refused.ok).toBe(false)
  expect(bookOf(store).settings).toEqual({ "@matomezu/base:print-preview-flow": "row" })
})

test("印刷区画に載っているか: 形ははみ出しが半分より小さければ始めの印刷区画、半分以上なら次の印刷区画に載る。空の印刷区画は印刷プレビューに並べない", async () => {
  const store = newStore()
  const done = store.actions.perform("@matomezu/base:page-update", { page: "p1", grows: "right-down" }, { book: "b1" })
  expect(done.ok).toBe(true)
  const place = (x: number, caption: string) =>
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page: "p1", item: BOX, at: { x, y: 40 }, props: { caption } },
      { book: "b1" },
    )
  const book = () => store.state.getState().books.b1 as PagedBook
  const filled = () => [...(filledSheets(store.catalog.core, book(), book().pages[0]!) ?? [])].sort()
  const paperW = paperSize(store.catalog.core, book().pages[0]!)!.w
  expect(place(40, "一").ok).toBe(true)
  expect(filled()).toEqual(["0,0"])
  // 1 つ目の印刷区画の右の端から少しだけはみ出す箱は 1 つ目の印刷区画に、大きくはみ出す箱は 2 つ目の印刷区画に載る
  const box = (caption: string) =>
    book().pages[0]!.items!.find(i => (i.props as { caption?: string }).caption === caption)!
  const w = placedSize(store.catalog.core, box("一") as never)!.w
  expect(place(paperW - w + 10, "少し").ok).toBe(true)
  expect(filled()).toEqual(["0,0"])
  expect(place(paperW - 10, "大きく").ok).toBe(true)
  expect(filled()).toEqual(["0,0", "1,0"])
  expect(bookSheets(store.catalog.core, book()).sheets.map(s => `${s.column},${s.row}`)).toEqual(["0,0", "1,0"])
})

test("印刷区画に載っているか: 手で直した線の角がある印刷区画は載り、線が通り抜けるだけの印刷区画は載らない。印刷区画より大きい形は掛かる印刷区画の全部に載り、縦も半分の決まりで決まる", () => {
  const store = newStore()
  store.actions.perform("@matomezu/base:page-update", { page: "p1", grows: "right-down" }, { book: "b1" })
  const place = (x: number, y: number, w = 100) =>
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page: "p1", item: BOX, at: { x, y }, w, h: 64 },
      { book: "b1" },
    )
  const book = () => store.state.getState().books.b1 as PagedBook
  const filled = () => [...(filledSheets(store.catalog.core, book(), book().pages[0]!) ?? [])].sort()
  const paper = paperSize(store.catalog.core, book().pages[0]!)!
  expect(place(100, 100).ok).toBe(true) // n1
  expect(place(100, paper.h + 100).ok).toBe(true) // n2（下の印刷区画）
  // 両端を n1 と n2 の右の辺の真ん中に固定（ふち一周 328 の上で 132）。手で直した縦の区間を右の印刷区画に置く
  const ends = { exitAt: 132 / 328, enterAt: 132 / 328 }
  const connect = (props: Record<string, unknown>) =>
    store.actions.perform("@matomezu/line:line-connect", { page: "p1", from: "n1", to: "n2", props }, { book: "b1" })
  const line = connect({ ...ends })
  expect(line.ok).toBe(true)
  expect(filled()).toEqual(["0,0", "0,1"])
  const id = (line as { result: { line: string } }).result.line
  const update = store.actions.perform(
    "@matomezu/line:line-update",
    { page: "p1", line: id, props: { via: [paper.w + 200] } },
    { book: "b1" },
  )
  expect(update.ok).toBe(true)
  expect(filled()).toEqual(["0,0", "0,1", "1,0", "1,1"])
  // 印刷区画より広い形は、掛かる 2 つの印刷区画に載る。下の端から形の半分以上はみ出す形は、下の印刷区画に載る
  const wide = { x: 50, y: 300, w: paper.w + 100, h: 64 }
  expect(sheetsOfShape(wide, paper)).toEqual([
    { column: 0, row: 0 },
    { column: 1, row: 0 },
  ])
  expect(sheetsOfShape({ x: 50, y: paper.h - 30, w: 100, h: 64 }, paper)).toEqual([{ column: 0, row: 1 }])
  expect(sheetsOfShape({ x: 50, y: paper.h - 34, w: 100, h: 64 }, paper)).toEqual([{ column: 0, row: 0 }])
})

test("アイテムの位置をデータに持たないタイプ（ツリーなど）は判定せず、どの印刷区画も並べる", () => {
  const store = newStore()
  const tree = {
    type: "@matomezu/tree:tree" as const,
    id: "t1",
    title: "木",
    pages: [{ id: "p1", title: "1", paper: "@matomezu/base:a4", orientation: "landscape" as const }],
  }
  expect(filledSheets(store.catalog.core, tree as never, tree.pages[0]!)).toBeNull()
  expect(bookSheets(store.catalog.core, tree as never).sheets).toHaveLength(1)
})
