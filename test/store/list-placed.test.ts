import { expect, test } from "bun:test"
import type { Point } from "../../web/src/core/geom"
import { GAP } from "../../web/src/core/place/push"
import { shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { placement } from "../../web/src/core/stage"
import { resolveTokens } from "../../web/src/core/theme"
import { BOX } from "../../web/src/plugins/items/box/box"
import { LIST } from "../../web/src/plugins/items/list/list"
import { LIST_MIN, LIST_SIZE, listCaptionWidth, placedListWidth } from "../../web/src/plugins/items/list/size"
import { PLACE_OFFSET } from "../../web/src/plugins/paper/placing/items"
import { CORE_CATALOG, newStore } from "../support"

// 置いたリストの大きさ・押されたときの縮め方・コマンド・データの形（箱と同じ置き場の決まりを、リストも持つこと）
const PAPER = { w: 1123, h: 794 } // A4 横

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
type Store = ReturnType<typeof ready>
const at = (store: Store, id: string) =>
  shapesOf((store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!).find(i => i.id === id)!
const place = (store: Store, item: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  store.actions.perform("@matomezu/paper:item-place", { page: "p1", item, at: { x, y }, ...extra }, { book: "b1" })
const resize = (store: Store, item: string, size: { w?: number; h?: number }) =>
  store.actions.perform("@matomezu/paper:item-resize", { page: "p1", item, ...size }, { book: "b1" })
const update = (store: Store, item: string, props: Record<string, unknown>) =>
  store.actions.perform("@matomezu/paper:item-update", { page: "p1", item, props }, { book: "b1" })

test("リストの大きさは置いたあとも変えられる。一番小さい大きさ（見出しと「＋」の行）より小さくはできない", () => {
  const store = ready()
  place(store, "@matomezu/list:shape-list", 100, 100)
  expect(resize(store, "n1", { w: LIST_MIN.w - 1 }).ok).toBe(false)
  expect(resize(store, "n1", { h: LIST_MIN.h - 1 }).ok).toBe(false)
  expect(resize(store, "n1", { w: LIST_MIN.w, h: LIST_MIN.h }).ok).toBe(true)
  expect(at(store, "n1")).toMatchObject({ w: LIST_MIN.w, h: LIST_MIN.h })
})

test("リストのキャプションを長くすると、キャプションが見える幅まで右へ広げる。狭めはしない", () => {
  const store = ready()
  place(store, "@matomezu/list:shape-list", 100, 100, { props: { caption: "a" } })
  expect(at(store, "n1")).toMatchObject({ w: LIST_SIZE.w, h: LIST_SIZE.h })
  const long = "とても長いリストのキャプションでございますよ"
  expect(update(store, "n1", { caption: long }).ok).toBe(true)
  expect(placedListWidth(long)).toBeGreaterThan(LIST_SIZE.w)
  expect(at(store, "n1").w).toBe(listCaptionWidth(long))
  update(store, "n1", { caption: "b" })
  expect(at(store, "n1").w).toBe(listCaptionWidth(long))
})

test("押されたリストを縮めるときは、横はキャプションが見える幅、縦は見出しと「＋」の行の高さまで", () => {
  const store = ready()
  place(store, "@matomezu/box:shape-box", 100, 100, { w: 100, h: 60 })
  place(store, "@matomezu/list:shape-list", 220, 100, { props: { caption: "L" } })
  const floor = listCaptionWidth("L")
  expect(resize(store, "n1", { w: PAPER.w - 100 - GAP - floor }).ok).toBe(true)
  expect(at(store, "n2")).toMatchObject({ x: PAPER.w - floor, w: floor })
  expect(resize(store, "n1", { w: PAPER.w - 100 - GAP - floor + 1 }).ok).toBe(false)

  const down = ready()
  place(down, "@matomezu/box:shape-box", 100, 100, { w: 100, h: 60 })
  place(down, "@matomezu/list:shape-list", 100, 200)
  expect(resize(down, "n1", { h: PAPER.h - 100 - GAP - LIST_MIN.h }).ok).toBe(true)
  expect(at(down, "n2")).toMatchObject({ y: PAPER.h - LIST_MIN.h, h: LIST_MIN.h })
  expect(resize(down, "n1", { h: PAPER.h - 100 - GAP - LIST_MIN.h + 1 }).ok).toBe(false)
})

// 紙の上の点 p にアイテムの左上が来るポインタの位置
function pointerFor(store: Store, p: Point): Point {
  const s = placement(store.state.getState().workspace.stages[0]!)!
  return { x: s.x + p.x * s.zoom + PLACE_OFFSET.x, y: s.y + p.y * s.zoom + PLACE_OFFSET.y }
}

test("リストを置こうとして紙の上で押すとリストの追加のダイアログ、リストの編集のコマンドはリストの設定のダイアログを開く", () => {
  const store = ready()
  store.actions.togglePlacing("s1", "@matomezu/list:shape-list")
  expect(store.actions.command("s1", "@matomezu/paper:paper-place", pointerFor(store, { x: 100, y: 50 }))).toBe(true)
  expect(store.state.getState().dialog).toMatchObject({
    id: "@matomezu/list:list-add",
    args: { page: "p1", at: { x: 100, y: 50 } },
  })
  store.actions.closeDialog()
  place(store, "@matomezu/list:shape-list", 100, 100)
  store.actions.command("s1", "@matomezu/paper:paper-edit", { item: "n1" })
  expect(store.state.getState().dialog).toMatchObject({
    id: "@matomezu/list:list-edit",
    args: { page: "p1", item: "n1" },
  })
})

test("図面のデータの形: 行（children）を持てるのはリストだけ。行の項目は行の形で確かめる", () => {
  const book = (item: Record<string, unknown>) => ({
    type: "@matomezu/drawing:drawing",
    id: "x",
    title: "x",
    pages: [
      {
        id: "p",
        title: "p",
        paper: "@matomezu/base:a4",
        orientation: "landscape",
        items: [{ id: "i", x: 0, y: 0, ...item }],
      },
    ],
  })
  const row = { id: "r", item: "list.row", props: { caption: "行" } }
  const ok = (item: Record<string, unknown>) => CORE_CATALOG.bookSchema.safeParse(book(item)).success
  expect(ok({ item: "@matomezu/list:shape-list", props: {}, children: [row] })).toBe(true)
  expect(ok({ item: "@matomezu/list:shape-list", props: {} })).toBe(true)
  expect(ok({ item: "@matomezu/box:shape-box", props: {}, children: [row] })).toBe(false)
  expect(ok({ item: "@matomezu/list:shape-list", props: {}, children: [{ ...row, props: { caption: 1 } }] })).toBe(
    false,
  )
  expect(
    ok({ item: "@matomezu/list:shape-list", props: {}, children: [{ ...row, item: "@matomezu/box:shape-box" }] }),
  ).toBe(false)
  expect(ok({ item: "shape.nope", props: {} })).toBe(false)
})

test("リストの塗り・文字・線・角・影の欄は、どのテーマでも箱の欄と同じ値（テーマは箱とリストを同じ見た目にする）", () => {
  const pairs = ["fill", "text", "line", "radius", "shadow"] as const
  for (const theme of CORE_CATALOG.themes.keys()) {
    const box = resolveTokens(CORE_CATALOG, theme, BOX.tokens)
    const list = resolveTokens(CORE_CATALOG, theme, LIST.tokens)
    for (const k of pairs) expect([theme, k, list[`list.${k}`]]).toEqual([theme, k, box[`box.${k}`]])
  }
})
