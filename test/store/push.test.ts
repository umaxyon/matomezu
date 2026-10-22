import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { placedWidth } from "../../web/src/plugins/books/drawing/box/size"
import { GAP, planMove, planPlace, pushFrom, type Rect } from "../../web/src/plugins/books/drawing/items/push"
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

const ids = (...xs: string[]) => new Set(xs)

test("動いた向きの正面の相手に半分以上入ったら入れ替わる: 相手は動かした箱の大きさと間隔の分だけ動き始めた側へずれ、まだ近ければ動かした箱は相手の向こう側へ", () => {
  const before = rects({ a: r(100, 100), b: r(220, 100) })
  const after = planMove(before, ids("a"), { x: 160, y: 0 }, PAPER)!
  expect(after.get("a")).toEqual(r(260, 100))
  expect(after.get("b")).toEqual(r(220 - 100 - GAP, 100))
  const adjacent = rects({ a: r(100, 100), b: r(200 + GAP, 100) })
  const swapped = planMove(adjacent, ids("a"), { x: 60, y: 0 }, PAPER)!
  expect(swapped.get("b")).toEqual(r(100, 100))
  expect(swapped.get("a")).toEqual(r(200 + GAP, 100))
  expect(planMove(adjacent, ids("a"), { x: 40, y: 0 }, PAPER)!.get("b")).toEqual(r(240 + GAP, 100))
})

test("浅く入ったら、入ってきた向き（重なりの浅い方の向き）に相手を押す（列ごと）", () => {
  const before = rects({ a: r(100, 100), b: r(300, 100), c: r(420, 100) })
  const after = planMove(before, ids("a"), { x: 120, y: 5 }, PAPER)!
  expect(after.get("a")).toEqual(r(220, 105))
  expect(after.get("b")).toEqual(r(320 + GAP, 100))
  expect(after.get("c")).toEqual(r(320 + GAP + 100 + GAP, 100))
  const down = planMove(rects({ a: r(100, 100), b: r(110, 260) }), ids("a"), { x: 0, y: 120 }, PAPER)!
  expect(down.get("b")).toEqual(r(110, 280 + GAP))
})

test("押せなければ、動かした箱を相手の手前（入ってきた側）で止める", () => {
  const wall = planMove(rects({ a: r(300, 100), b: r(0, 100) }), ids("a"), { x: -200, y: 0 }, PAPER)!
  expect(wall.get("a")).toEqual(r(100 + GAP, 100))
  expect(wall.get("b")).toEqual(r(0, 100))
  const chain = rects({ a: r(500, 100), b: r(0, 100), c: r(100 + GAP + 4, 100) })
  const stopped = planMove(chain, ids("a"), { x: -300, y: 0 }, PAPER)!
  expect(stopped.get("a")).toEqual(r(100 + GAP + 4 + 100 + GAP, 100))
  expect(stopped.get("c")).toEqual(r(100 + GAP + 4, 100))
})

test("何人かまとめて動かしても、押すのは動かした箱以外。紙からはみ出す動きは収まらない", () => {
  const before = rects({ a: r(100, 100), b: r(100, 200), c: r(260, 100, 100, 160) })
  const after = planMove(before, ids("a", "b"), { x: 100, y: 0 }, PAPER)!
  expect(after.get("a")).toEqual(r(200, 100))
  expect(after.get("c")).toEqual(r(300 + GAP, 100, 100, 160))
  expect(planMove(before, ids("a"), { x: -200, y: 0 }, PAPER)).toBeNull()
})

test("置いた所に箱があれば、相手を右へ押し、駄目なら下へ押す。どちらも駄目なら置けない", () => {
  const after = planPlace(rects({ b: r(150, 100) }), "n", r(100, 100), PAPER)!
  expect(after.get("b")).toEqual(r(200 + GAP, 100))
  const right = rects({ b: r(1000, 100) })
  expect(planPlace(right, "n", r(960, 100), PAPER)!.get("b")).toEqual(r(1000, 160 + GAP))
  const corner = rects({ b: r(1000, 700) })
  expect(planPlace(corner, "n", r(960, 680), PAPER)).toBeNull()
})
