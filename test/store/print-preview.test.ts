import { expect, test } from "bun:test"
import type { PagedBook } from "../../web/src/core/book"
import { pageContext } from "../../web/src/plugins/base/book-settings"
import { growOf, paperSize } from "../../web/src/plugins/base/place/items"
import { placedSize } from "../../web/src/plugins/base/place/placed"
import { bookCrossings, bookSheets, sheetsOfPage } from "../../web/src/plugins/base/print-preview/book-sheets"
import { filledSheets, sheetsOfShape } from "../../web/src/plugins/base/print-preview/filled"
import { printLaid as printDir } from "../../web/src/plugins/books/dir/print"
import { printLaid as printTree } from "../../web/src/plugins/books/tree/print"
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

test("印刷区画に載っているか: 形は掛かっている印刷区画のどれにも載る。またいだ形は直してもらう形として挙げる。空の印刷区画は印刷プレビューに並べない", async () => {
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
  // 1 つ目の印刷区画の右の端から少しだけはみ出す箱は、1 つ目と 2 つ目の印刷区画の両方に載り、またいだ箱として挙がる
  const box = (caption: string) =>
    book().pages[0]!.items!.find(i => (i.props as { caption?: string }).caption === caption)!
  const w = placedSize(store.catalog.core, box("一") as never)!.w
  expect(place(paperW - w + 10, "少し").ok).toBe(true)
  expect(filled()).toEqual(["0,0", "1,0"])
  expect(bookCrossings(store.catalog.core, book())).toEqual([{ page: "p1", crossing: [box("少し").id], oversized: [] }])
  expect(bookSheets(store.catalog.core, book()).sheets.map(s => `${s.column},${s.row}`)).toEqual(["0,0", "1,0"])
})

test("印刷区画に載っているか: 手で直した線の角がある印刷区画は載り、線が通り抜けるだけの印刷区画は載らない。形は掛かる印刷区画の全部に載る（端がちょうど境目なら次には掛からない）", () => {
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
  // 印刷区画より広い形は、掛かる 2 つの印刷区画に載る。下の境目をまたぐ形は上下の両方に、端がちょうど境目の形は上だけに載る
  const wide = { x: 50, y: 300, w: paper.w + 100, h: 64 }
  expect(sheetsOfShape(wide, paper)).toEqual([
    { column: 0, row: 0 },
    { column: 1, row: 0 },
  ])
  expect(sheetsOfShape({ x: 50, y: paper.h - 30, w: 100, h: 64 }, paper)).toEqual([
    { column: 0, row: 0 },
    { column: 0, row: 1 },
  ])
  expect(sheetsOfShape({ x: 50, y: paper.h - 64, w: 100, h: 64 }, paper)).toEqual([{ column: 0, row: 0 }])
})

test("ツリーのように並べ方を描くときに決めるタイプは、見せ方の printSheets が印刷区画と載っている印刷区画を返す（形の位置からは判定しない）", () => {
  const store = newStore()
  const page = {
    id: "p1",
    title: "1",
    paper: "@matomezu/base:a4",
    orientation: "landscape" as const,
    root: { id: "r", caption: "根", children: [] },
  }
  const tree = { type: "@matomezu/tree:tree" as const, id: "t1", title: "木", pages: [page] }
  expect(filledSheets(store.catalog.core, tree as never, page)).toBeNull()
  expect(sheetsOfPage(store.catalog.core, tree as never, page)).toEqual({
    columns: 1,
    rows: 1,
    filled: new Set(["0,0"]),
  })
  expect(bookSheets(store.catalog.core, tree as never).sheets).toHaveLength(1)
})

test("可変ページのツリーとディレクトリ構成図で中身があふれると、printSheets は書く画面と同じ並べ方で増えた印刷区画を数え、中身の載る印刷区画を返す", () => {
  const store = newStore()
  const paper = { paper: "@matomezu/base:a4", orientation: "landscape" as const, grows: true as const }
  const children = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, caption: `子 ${i}` }))
  const treePage = { id: "p1", title: "1", ...paper, root: { id: "r", caption: "根", children } }
  const tree = { type: "@matomezu/tree:tree" as const, id: "t1", title: "木", pages: [treePage] }
  const t = sheetsOfPage(store.catalog.core, tree as never, treePage)!
  expect(t.columns * t.rows).toBeGreaterThan(1)
  expect(t.filled?.size).toBeGreaterThan(1)
  const files = Array.from({ length: 80 }, (_, i) => ({ id: `f${i}`, kind: "file" as const, name: `file${i}.ts` }))
  const dirPage = {
    id: "p1",
    title: "1",
    ...paper,
    root: { id: "r", kind: "folder" as const, name: "proj", children: files },
  }
  const dir = { type: "@matomezu/dir:dir" as const, id: "d1", title: "構成", pages: [dirPage] }
  const d = sheetsOfPage(store.catalog.core, dir as never, dirPage)!
  expect(d.rows).toBeGreaterThan(1)
  expect(d.filled?.has("0,1")).toBe(true)
})

test("印刷区画より大きい形は、またいでも直せないので、印刷区画より大きい形として挙げる（印刷プレビューは開ける）", () => {
  const store = newStore()
  store.actions.perform("@matomezu/base:page-update", { page: "p1", grows: "right-down" }, { book: "b1" })
  const book = () => store.state.getState().books.b1 as PagedBook
  const paper = paperSize(store.catalog.core, book().pages[0]!)!
  const done = store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: BOX, at: { x: 40, y: 40 }, w: paper.w + 200, h: 64 },
    { book: "b1" },
  )
  expect(done.ok).toBe(true)
  const id = book().pages[0]!.items![0]!.id
  expect(bookCrossings(store.catalog.core, book())).toEqual([{ page: "p1", crossing: [], oversized: [id] }])
  expect(store.actions.command("s1", "@matomezu/base:print-preview-open")).toBe(true)
  expect(store.state.getState().workspace.stages[0]!.mode.kind).toBe("print-preview")
})

test("印刷のときの改ページ: ツリーとディレクトリ構成図の節・行は、どれも 1 つの印刷区画に入り、線の端は節に付いたまま、区切り線は最後の行まで伸びる。書く画面の数え方は改ページの前", () => {
  const store = newStore()
  const paper = { paper: "@matomezu/base:a4", orientation: "landscape" as const, grows: true as const }
  const size = paperSize(store.catalog.core, { ...paper, id: "p", title: "" } as never)!
  const inOne = (r: { x: number; y: number; w: number; h: number }) =>
    Math.floor(r.x / size.w) === Math.floor((r.x + r.w - 1e-6) / size.w) &&
    Math.floor(r.y / size.h) === Math.floor((r.y + r.h - 1e-6) / size.h)
  const on = (book: { type: string }, page: object) => ({
    setting: pageContext(store.catalog.core, book as never, page as never).setting,
    grow: growOf(store.catalog.core, book as never, page as never),
  })
  const children = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, caption: `子 ${i}` }))
  const treePage = { id: "p1", title: "1", ...paper, root: { id: "r", caption: "根", children } }
  const tree = { type: "@matomezu/tree:tree", id: "t1", title: "木", pages: [treePage] }
  const laidTree = printTree(store.catalog.core, treePage as never, on(tree, treePage))!
  expect(laidTree.nodes.every(inOne)).toBe(true)
  const node = new Map(laidTree.nodes.map(n => [n.id, n]))
  const onEdge = (p: { x: number; y: number }, id: string) => {
    const n = node.get(id)!
    return p.x >= n.x - 1e-6 && p.x <= n.x + n.w + 1e-6 && p.y >= n.y - 1e-6 && p.y <= n.y + n.h + 1e-6
  }
  expect(laidTree.lines.every(l => onEdge(l.to, l.child))).toBe(true)
  const files = Array.from({ length: 80 }, (_, i) => ({ id: `f${i}`, kind: "file" as const, name: `file${i}.ts` }))
  const dirPage = {
    id: "p1",
    title: "1",
    ...paper,
    settings: { "@matomezu/dir:notes": { shown: true, dots: false, divider: true } },
    root: { id: "r", kind: "folder" as const, name: "proj", children: files.map(f => ({ ...f, description: "説明" })) },
  }
  const dir = { type: "@matomezu/dir:dir", id: "d1", title: "構成", pages: [dirPage] }
  const laidDir = printDir(store.catalog.core, dirPage as never, on(dir, dirPage))!
  expect(laidDir.rows.every(inOne)).toBe(true)
  const last = Math.max(...laidDir.rows.map(r => r.y + r.h))
  expect(laidDir.divider?.to.y).toBeGreaterThanOrEqual(last)
  // 書く画面の暗くする印刷区画は、改ページの前の並べ方で数える（印刷の並べ方より印刷区画が増えない）
  const printed = sheetsOfPage(store.catalog.core, dir as never, dirPage as never)!
  const screen = sheetsOfPage(store.catalog.core, dir as never, dirPage as never, "screen")!
  expect(screen.rows).toBeLessThanOrEqual(printed.rows)
})

test("並べ方が自動のタイプ（フローチャート）は、またいだ形を調べない", () => {
  const store = newStore()
  const flow = {
    type: "@matomezu/flowchart:flowchart",
    id: "f1",
    title: "流れ",
    pages: [{ id: "p1", title: "1", paper: "@matomezu/base:a4", orientation: "landscape", grows: true, items: [] }],
  }
  expect(bookCrossings(store.catalog.core, flow as never)).toEqual([])
})

test("測るページ（measured）は測った数だけ 1 列に並べ、測っている途中と、測って 0 のページは並べない。測らないページは前のまま", () => {
  const store = newStore()
  const pages = ["a", "b", "c", "d"].map(id => ({
    id,
    title: id,
    paper: "@matomezu/base:a4",
    orientation: "landscape" as const,
    items: [],
  }))
  const book = { type: "@matomezu/drawing:drawing" as const, id: "x", title: "x", pages }
  pages[3]!.items = [{ id: "n1", item: BOX, x: 40, y: 40, w: 100, h: 64, props: {} }] as never
  const measured = new Map<string, number | "pending">([
    ["a", 3],
    ["b", "pending"],
    ["c", 0],
  ])
  const cells = bookSheets(store.catalog.core, book as never, measured).sheets.map(
    s => `${s.page}:${s.column},${s.row}`,
  )
  expect(cells).toEqual(["a:0,0", "a:0,1", "a:0,2", "d:0,0"])
})
