// つまみのドラッグで並べ替えた後の並び（taskboard/reorder/order.ts）: ドラッグした行を、離した行の位置へ（下へ動かすときは後ろ、上へ動かすときは前）
import { expect, test } from "bun:test"
import { moved } from "../../../web/src/plugins/taskboard/reorder/order"

test("下へ動かすときは離した行の後ろ、上へ動かすときは前に入る。同じ行の上で離しても変わらない", () => {
  expect(moved(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"])
  expect(moved(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"])
  expect(moved(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"])
})

test("元の並びは変えない", () => {
  const list = ["a", "b", "c"]
  moved(list, "a", "c")
  expect(list).toEqual(["a", "b", "c"])
})
