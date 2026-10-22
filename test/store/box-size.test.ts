import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { BOX_LOOK, boxLayout } from "../../web/src/plugins/books/drawing/box/size"
import { placedSize } from "../../web/src/plugins/books/drawing/items"
import { newStore } from "../support"

const page = (store: ReturnType<typeof newStore>) => (store.state.getState().books.b1 as BookOf<"drawing">).pages[0]!
const items = (store: ReturnType<typeof newStore>) => page(store).items ?? []
const box = (body: string, extra: Record<string, unknown> = {}) => ({ caption: "見出し", rule: true, body, ...extra })
// 本文が n 行の箱の高さ（上下の枠と余白・キャプション・区切り線・本文）
const heightOf = (n: number, rule = true) =>
  2 * (BOX_LOOK.border + BOX_LOOK.padY) + BOX_LOOK.line + (rule ? 2 * BOX_LOOK.ruleGap + 1 : 0) + n * BOX_LOOK.line

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
const place = (store: ReturnType<typeof newStore>, props: Record<string, unknown>, at = { x: 100, y: 100 }, w?: number) =>
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at, props, ...(w ? { w } : {}) }, { book: "b1" })

test("箱の高さは中身から決まり、一番低くて 64。本文は幅で折り返した行の数だけ伸びる", () => {
  expect(boxLayout(box(""), 160).size).toEqual({ w: 160, h: 64 })
  expect(boxLayout(box("短い"), 160).size).toEqual({ w: 160, h: 64 })
  const long = "あ".repeat(40)
  const narrow = boxLayout(box(long), 160)
  const wide = boxLayout(box(long), 320)
  expect(narrow.size.h).toBe(heightOf(narrow.body.length))
  expect(narrow.body.length).toBeGreaterThan(wide.body.length)
  expect(narrow.body.join("")).toBe(long)
  expect(boxLayout(box("一\n二\n三\n四", { rule: false }), 160).size.h).toBe(heightOf(4, false))
})

test("本文の最大の行数を超えた分は … で切り、その行数の高さになる", () => {
  const layout = boxLayout(box("一\n二\n三\n四\n五", { bodyLines: 2 }), 160)
  expect(layout.body).toEqual(["一", "二…"])
  expect(layout.clipped).toBe(true)
  expect(layout.size.h).toBe(Math.max(64, heightOf(2)))
  expect(boxLayout(box("一\n二"), 160).clipped).toBe(false)
})

test("置くときに幅を渡せる。一番狭い幅より狭い幅では置かない", () => {
  const store = ready()
  expect(place(store, box("本文"), { x: 100, y: 100 }, 240).ok).toBe(true)
  expect(items(store)[0]).toMatchObject({ w: 240 })
  expect(placedSize(store.registry, items(store)[0]!)).toEqual({ w: 240, h: 64 })
  expect(place(store, box(""), { x: 100, y: 300 }, 40).ok).toBe(false)
})

test("item.resize で幅を変える。x を渡せば左端も動く。狭すぎる・紙の外へ出る幅は断る", () => {
  const store = ready()
  place(store, box("本文"))
  const resize = (args: { w: number; x?: number }) =>
    store.actions.perform("item.resize", { page: "p1", item: "n1", ...args }, { book: "b1" })
  expect(resize({ w: 300 }).ok).toBe(true)
  expect(items(store)[0]).toMatchObject({ x: 100, w: 300 })
  expect(resize({ w: 350, x: 50 }).ok).toBe(true)
  expect(items(store)[0]).toMatchObject({ x: 50, w: 350 })
  expect(resize({ w: 79 }).ok).toBe(false)
  expect(resize({ w: 2000 }).ok).toBe(false)
  expect(items(store)[0]).toMatchObject({ x: 50, w: 350 })
})

test("幅を狭めて本文の行が増え、紙の下にはみ出すなら断る", () => {
  const store = ready()
  place(store, box("あ".repeat(30)), { x: 100, y: 794 - 70 }, 600)
  const resize = store.actions.perform("item.resize", { page: "p1", item: "n1", w: 100 }, { book: "b1" })
  expect(resize.ok).toBe(false)
  expect(items(store)[0]).toMatchObject({ w: 600 })
})

test("中身を変えて紙の下にはみ出すなら断る。null を渡した項目は消す（最大の行数を制限なしに戻す）", () => {
  const store = ready()
  place(store, box("短い", { bodyLines: 2 }), { x: 100, y: 794 - 90 })
  const update = (props: Record<string, unknown>) =>
    store.actions.perform("item.update", { page: "p1", item: "n1", props }, { book: "b1" })
  const many = "一\n二\n三\n四\n五\n六"
  expect(update({ body: many }).ok).toBe(true)
  expect(update({ bodyLines: null }).ok).toBe(false)
  expect(items(store)[0]!.props).toMatchObject({ body: many, bodyLines: 2 })
  store.actions.perform("item.move", { page: "p1", items: ["n1"], by: { x: 0, y: -400 } }, { book: "b1" })
  expect(update({ bodyLines: null }).ok).toBe(true)
  expect("bodyLines" in items(store)[0]!.props).toBe(false)
})

test("画面から辺をつかんで幅を変える: 右は右端だけ、左は左端だけが動き、一番狭い幅で止まる", () => {
  const store = ready()
  place(store, box("本文"))
  const zoom = store.state.getState().workspace.stages[0]!.zoom
  store.actions.select("s1", ["n1"])
  store.actions.command("s1", "drawing.resize", { item: "n1", side: "right", by: 40 * zoom })
  expect(items(store)[0]).toMatchObject({ x: 100, w: 200 })
  store.actions.command("s1", "drawing.resize", { item: "n1", side: "left", by: -20 * zoom })
  expect(items(store)[0]).toMatchObject({ x: 80, w: 220 })
  store.actions.command("s1", "drawing.resize", { item: "n1", side: "left", by: 1000 * zoom })
  expect(items(store)[0]).toMatchObject({ x: 220, w: 80 })
})
