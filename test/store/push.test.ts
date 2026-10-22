import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { placedWidth } from "../../web/src/plugins/books/drawing/box/size"
import { GAP, pushFrom, type Rect } from "../../web/src/plugins/books/drawing/items/push"
import { newStore } from "../support"

const PAPER = { w: 1123, h: 794 } // A4 横
const rects = (o: Record<string, Rect>) => new Map(Object.entries(o))
const r = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h })

test("横に育つと、右に並んだ箱を同じ向きに押し、押された箱がまた右の箱を押す。左の箱と、離れた箱は動かない", () => {
  const before = rects({ a: r(100, 100), b: r(220, 100), c: r(340, 100), left: r(0, 100, 90), far: r(800, 100) })
  const after = pushFrom(before, "a", r(100, 100, 200), PAPER)!
  expect(after.get("b")).toEqual(r(300 + GAP, 100))
  expect(after.get("c")).toEqual(r(300 + GAP + 100 + GAP, 100))
  expect(after.get("left")).toEqual(r(0, 100, 90))
  expect(after.get("far")).toEqual(r(800, 100))
})

test("縦に育つと、下の箱を下へ押す。横には動かさない", () => {
  const after = pushFrom(rects({ a: r(100, 100), b: r(130, 180) }), "a", r(100, 100, 100, 150), PAPER)!
  expect(after.get("b")).toEqual(r(130, 250 + GAP))
})

test("左の辺をつかんで左へ広げると、左の箱を左へ押す", () => {
  const after = pushFrom(rects({ a: r(300, 100), b: r(150, 100) }), "a", r(200, 100, 200), PAPER)!
  expect(after.get("b")).toEqual(r(200 - GAP - 100, 100))
})

test("斜めに離れた箱は、横と縦の両方で近づきすぎたときだけ、離れていた方の向きに押す", () => {
  const before = rects({ a: r(100, 100), b: r(260, 200) })
  expect(pushFrom(before, "a", r(100, 100, 150), PAPER)!.get("b")).toEqual(r(260, 200))
  expect(pushFrom(before, "a", r(100, 100, 200, 140), PAPER)!.get("b")).toEqual(r(300 + GAP, 200))
})

test("押した先が紙からはみ出すなら収まらない。前から近づきすぎていた組は押さない", () => {
  expect(pushFrom(rects({ a: r(800, 100), b: r(1000, 100) }), "a", r(800, 100, 250), PAPER)).toBeNull()
  const after = pushFrom(rects({ a: r(100, 100), b: r(150, 120) }), "a", r(100, 100, 120), PAPER)!
  expect(after.get("b")).toEqual(r(150, 120))
})

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
const items = (store: ReturnType<typeof newStore>) =>
  (store.state.getState().books.b1 as BookOf<"drawing">).pages[0]!.items ?? []
const at = (store: ReturnType<typeof newStore>, id: string) => items(store).find(i => i.id === id)!
const place = (store: ReturnType<typeof newStore>, x: number, y: number, w: number, caption = "") =>
  store.actions.perform(
    "item.place",
    { page: "p1", item: "shape.box", at: { x, y }, w, h: 64, props: { caption } },
    { book: "b1" },
  )

test("item.resize で広げると隣の箱を押し、押した箱が紙からはみ出すなら断って何も変えない", () => {
  const store = ready()
  place(store, 100, 100, 100)
  place(store, 220, 100, 100)
  const resize = (w: number) => store.actions.perform("item.resize", { page: "p1", item: "n1", w }, { book: "b1" })
  expect(resize(200).ok).toBe(true)
  expect(at(store, "n2")).toMatchObject({ x: 300 + GAP, y: 100 })
  expect(resize(940).ok).toBe(false)
  expect(at(store, "n1").w).toBe(200)
  expect(at(store, "n2")).toMatchObject({ x: 300 + GAP })
})

test("キャプションで広がるときも隣を押す。押した箱が収まらなければ、広げずにキャプションだけ変える", () => {
  const store = ready()
  place(store, 100, 100, 64)
  place(store, 180, 100, 100)
  const update = (caption: string) =>
    store.actions.perform("item.update", { page: "p1", item: "n1", props: { caption } }, { book: "b1" })
  const twenty = "あ".repeat(20)
  expect(update(twenty).ok).toBe(true)
  const w = placedWidth({ caption: twenty, rule: true, body: "", captionAlign: "center", bodyAlign: "left" })
  expect(at(store, "n1").w).toBe(w)
  expect(at(store, "n2").x).toBe(100 + w + GAP)
  place(store, 1023 - 100, 300, 100)
  place(store, 100, 300, 64)
  store.actions.perform("item.resize", { page: "p1", item: "n3", x: 1023 }, { book: "b1" })
  store.actions.perform("item.resize", { page: "p1", item: "n4", x: 1023 - 100 - GAP - 64 }, { book: "b1" })
  expect(
    store.actions.perform("item.update", { page: "p1", item: "n4", props: { caption: twenty } }, { book: "b1" }).ok,
  ).toBe(true)
  expect(at(store, "n4")).toMatchObject({ w: 64, props: { caption: twenty } })
})
