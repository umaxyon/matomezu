import { expect, test } from "bun:test"
import { placeBubble } from "../../../web/src/plugins/base/utils/fit"

const view = { w: 200, h: 100 }
const size = { w: 50, h: 30 }

test("placeBubble は、下に入るときは点の下に出す", () => {
  expect(placeBubble({ x: 10, y: 20, above: 5 }, size, view)).toEqual({ x: 10, y: 24 })
})

test("placeBubble は、下に入らないときは above の上に出す（above が無ければ点の上）", () => {
  expect(placeBubble({ x: 10, y: 90, above: 75 }, size, view)).toEqual({ x: 10, y: 41 })
  expect(placeBubble({ x: 10, y: 90 }, size, view)).toEqual({ x: 10, y: 56 })
})

test("placeBubble は、右にはみ出すときは左へ寄せる", () => {
  expect(placeBubble({ x: 180, y: 20, above: 5 }, size, view)).toEqual({ x: 150, y: 24 })
})

test("placeBubble は、side が above なら above の上に出し、窓の上に入らなければ点の下に出す", () => {
  expect(placeBubble({ x: 10, y: 60, above: 50, side: "above" }, size, view)).toEqual({ x: 10, y: 16 })
  expect(placeBubble({ x: 10, y: 20, above: 5, side: "above" }, size, view)).toEqual({ x: 10, y: 24 })
})
