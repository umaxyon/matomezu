// 物の右上の角に出す物の並べ方（utils/corner-order.ts）
import { expect, test } from "bun:test"
import { type CornerEntry, cornersByAnchor } from "../../web/src/plugins/base/utils/corner-order"

test("角に出す物は物ごとに分け、order の小さい物が先、同じ order なら at の新しい物が先、同じなら後に登録した物が先。物の順は最初に登録された順", () => {
  const entry = (anchor: string, order: number, at: string, seq: number): CornerEntry => ({
    anchor,
    order,
    at,
    look: null,
    pointer: null,
    seq,
  })
  const groups = cornersByAnchor(
    new Map([
      ["read-old", entry("x", 20, "2026-11-06T01:00:00.000Z", 0)],
      ["folded", entry("x", 10, "2026-11-06T00:00:00.000Z", 1)],
      ["other", entry("y", 0, "2026-11-06T00:00:00.000Z", 2)],
      ["read-new", entry("x", 20, "2026-11-06T03:00:00.000Z", 3)],
      ["alert", entry("x", 0, "2026-11-06T00:00:00.000Z", 4)],
      ["read-same", entry("x", 20, "2026-11-06T01:00:00.000Z", 5)],
    ]),
  )
  expect([...groups.keys()]).toEqual(["x", "y"])
  expect(groups.get("x")?.map(g => g.id)).toEqual(["alert", "folded", "read-new", "read-same", "read-old"])
  expect(groups.get("y")?.map(g => g.id)).toEqual(["other"])
})
