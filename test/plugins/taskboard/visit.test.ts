// 鳥の立ち寄りの決め事: 入り口の判定・スクロールの量・置き場の変わり
import { expect, test } from "bun:test"
import {
  canVisit,
  nearestShift,
  type Placement,
  placementBroken,
  samePlace,
  withProject,
} from "../../../web/src/plugins/taskboard/visit"

const rect = { left: 10, top: 100, width: 200, height: 60 }
const ok: Placement = { rect, connected: true, inert: false, covered: false }

test("ボードで見るは、タスクボードが出ているか、設定を変えられるときだけ押せる", () => {
  expect(canVisit(["a"], "a", false)).toBe(true)
  expect(canVisit(["a"], "b", false)).toBe(false)
  expect(canVisit(["a"], "b", true)).toBe(true)
})

test("出すタスクボードの並びは、出ていればそのまま、出ていなければ後ろに足す", () => {
  expect(withProject(["a"], "a")).toEqual(["a"])
  expect(withProject(["a"], "b")).toEqual(["a", "b"])
})

test("スクロールは、見える所に入っていれば動かさず、はみ出した分だけ動かす", () => {
  expect(nearestShift(100, 160, 0, 500)).toBe(0)
  expect(nearestShift(100, 160, 0, 500, 56)).toBe(0)
  expect(nearestShift(30, 90, 0, 500, 56)).toBe(-26) // 上に鳥の場所が足りない
  expect(nearestShift(450, 560, 0, 500)).toBe(60)
  expect(nearestShift(100, 900, 0, 500)).toBe(100 - 0 - 0 > 0 ? 100 : 0) // 範囲より大きい物は始めを合わせる
})

test("置き場が変わった・つながりが切れた・inert・手前を覆われたら、置き場が変わったとする", () => {
  expect(placementBroken(rect, ok)).toBe(false)
  expect(placementBroken(rect, { ...ok, rect: { ...rect, top: 100.5 } })).toBe(false)
  expect(placementBroken(rect, { ...ok, rect: { ...rect, top: 120 } })).toBe(true)
  expect(placementBroken(rect, { ...ok, connected: false })).toBe(true)
  expect(placementBroken(rect, { ...ok, inert: true })).toBe(true)
  expect(placementBroken(rect, { ...ok, covered: true })).toBe(true)
  expect(samePlace(rect, { ...rect, width: 202 })).toBe(false)
})
