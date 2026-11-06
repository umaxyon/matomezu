// 物の右上の角に出す物の並べ方と、コーナーステータスの並び（utils/corner-order.ts）
import { expect, test } from "bun:test"
import {
  type CornerEntry,
  cornersByAnchor,
  movedStatus,
  statusOrder,
} from "../../web/src/plugins/base/utils/corner-order"

test("角に出す物は物ごとに分け、コーナーステータスの並びで先の物が先、同じコーナーステータスなら at の新しい物が先、同じなら後に登録した物が先。並びに無い物は後ろ。物の順は最初に登録された順", () => {
  const entry = (anchor: string, status: string, at: string, seq: number): CornerEntry => ({
    anchor,
    status,
    at,
    pointer: null,
    seq,
  })
  const groups = cornersByAnchor(
    new Map([
      ["read-old", entry("x", "read", "2026-11-06T01:00:00.000Z", 0)],
      ["folded", entry("x", "folded", "2026-11-06T00:00:00.000Z", 1)],
      ["other", entry("y", "alert", "2026-11-06T00:00:00.000Z", 2)],
      ["read-new", entry("x", "read", "2026-11-06T03:00:00.000Z", 3)],
      ["unknown", entry("x", "gone", "2026-11-06T09:00:00.000Z", 4)],
      ["alert", entry("x", "alert", "2026-11-06T00:00:00.000Z", 5)],
      ["read-same", entry("x", "read", "2026-11-06T01:00:00.000Z", 6)],
    ]),
    ["alert", "folded", "read"],
  )
  expect([...groups.keys()]).toEqual(["x", "y"])
  expect(groups.get("x")?.map(g => g.id)).toEqual(["alert", "folded", "read-new", "read-same", "read-old", "unknown"])
  expect(groups.get("y")?.map(g => g.id)).toEqual(["other"])
})

test("コーナーステータスの並びは、利用者の設定の並びのうち今ある物のあとに、設定に無い物をスロットの並びで足す（空なら、スロットの並びのまま）", () => {
  const placed = ["alert", "folded", "read", "added"]
  expect(statusOrder([], placed)).toEqual(placed)
  expect(statusOrder(["read", "gone", "alert"], placed)).toEqual(["read", "alert", "folded", "added"])
  expect(statusOrder(["read", "read"], placed)).toEqual(["read", "alert", "folded", "added"])
})

test("コーナーステータスを前・後ろへ 1 つ動かした設定の値は、今の並びを入れ替えた物で、今のインスタンスに無い物は後ろに残す。端なら変えない", () => {
  const placed = ["alert", "folded", "read"]
  expect(movedStatus([], placed, "read", -1)).toEqual(["alert", "read", "folded"])
  expect(movedStatus(["gone", "read"], placed, "alert", 1)).toEqual(["read", "folded", "alert", "gone"])
  expect(movedStatus(["read"], placed, "read", -1)).toEqual(["read"])
  expect(movedStatus([], placed, "read", 1)).toEqual([])
})
