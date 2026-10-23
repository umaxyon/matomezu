// 形の〇から線を引くときの決まり（drawing/line/connect.ts）

import { expect, test } from "bun:test"
import { rectsOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { drawnLineProps, portAt, targetsFrom } from "../../web/src/plugins/books/drawing/line/connect"
import { newStore, REGISTRY } from "../support"

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  const place = (x: number, y: number, item = "shape.box") =>
    store.actions.perform(
      "item.place",
      { page: "p1", item, at: { x, y }, ...(item === "shape.box" ? { w: 100, h: 64 } : {}) },
      { book: "b1" },
    )
  place(100, 100) // n1
  place(400, 100) // n2
  place(100, 300, "shape.list") // n3
  store.actions.perform("row.add", { page: "p1", list: "n3" }, { book: "b1" }) // n4
  return store
}
const page = (store: ReturnType<typeof ready>) => (store.state.getState().books.b1 as BookOf<"drawing">).pages[0]!

test("引ける相手は、同じページのつなげる形（自分も入る）。同じ組の線がある相手と、リストの行は入らない", () => {
  const store = ready()
  expect([...targetsFrom(REGISTRY, page(store), "n1")]).toEqual(["n1", "n2", "n3"])
  store.actions.perform("line.connect", { page: "p1", from: "n2", to: "n1" }, { book: "b1" })
  expect([...targetsFrom(REGISTRY, page(store), "n1")]).toEqual(["n1", "n3"])
  expect([...targetsFrom(REGISTRY, page(store), "n4")]).toEqual([])
})

test("〇は辺の真ん中から外へ。引いた線は、始点が〇の辺の真ん中、終点が離した所に一番近いふちの点で、終点に矢印", () => {
  const store = ready()
  const rects = rectsOf(REGISTRY, page(store))
  expect(portAt(rects.get("n1")!, "r", 10)).toEqual({ x: 210, y: 132 })
  const props = drawnLineProps(page(store), rects, true, "n1", "r", "n2", { x: 395, y: 110 })!
  // n1 の一周 328 の上で、右の辺の真ん中は 132。n2 の左の辺の y=110 の所は 328 - 10 = 318
  expect(props.exitAt).toBeCloseTo(132 / 328, 4)
  expect(props.enterAt).toBeCloseTo(318 / 328, 4)
  expect(props.endHead).toBe("arrow")
})

test("自分に戻る線: 離した所に一番近い角が自動の角（右上）なら端は自由、ほかの空いている角ならその角に固定", () => {
  const store = ready()
  const rects = rectsOf(REGISTRY, page(store))
  expect(drawnLineProps(page(store), rects, true, "n1", "t", "n1", { x: 195, y: 105 })).toEqual({ endHead: "arrow" })
  const left = drawnLineProps(page(store), rects, true, "n1", "t", "n1", { x: 105, y: 105 })!
  expect(left.exitAt).toBeDefined()
  expect(left.enterAt).toBeDefined()
})
