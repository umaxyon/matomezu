// 選んだアイテムの重ねの順を動かす手順（items/slide/order.ts）
import { expect, test } from "bun:test"
import { orderSteps } from "../web/src/plugins/items/slide/order"

const ids = ["a", "b", "c", "d", "e"]
const steps = (selected: string[], to: Parameters<typeof orderSteps>[2]) =>
  orderSteps(ids, new Set(selected), to).map(s => s.item)

test("最前面は後ろの物から順に、最背面は前の物から順に動かして、選んだ物どうしの前後を保つ", () => {
  expect(steps(["b", "d"], "front")).toEqual(["b", "d"])
  expect(steps(["b", "d"], "back")).toEqual(["d", "b"])
})

test("1 つ前へは前にある物から動かし、端の物は動かさず、その下の物もそれを越えない", () => {
  expect(steps(["b", "d"], "forward")).toEqual(["d", "b"])
  expect(steps(["d", "e"], "forward")).toEqual([]) // 端の e は動かず、d も e を越えない
  expect(steps(["c", "e"], "forward")).toEqual(["c"])
})

test("1 つ後ろへは後ろにある物から動かし、端の物は動かさない", () => {
  expect(steps(["b", "d"], "backward")).toEqual(["b", "d"])
  expect(steps(["a", "b"], "backward")).toEqual([])
  expect(steps(["a", "c"], "backward")).toEqual(["c"])
})

test("選んだ物が無ければ手順は無い", () => {
  expect(steps([], "front")).toEqual([])
})
