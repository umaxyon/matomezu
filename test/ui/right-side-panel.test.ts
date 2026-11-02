// 右サイドパネルの持ち方: base のステージの画面の状態の rightSidePanel に持ち、ほかの物は残す。開いたときのブックかページから替われば閉じる
import { expect, test } from "bun:test"
import { panelIn, stillOn, withPanel } from "../../web/src/plugins/base/right-side-panel/state"

const OPEN = { panel: "p:panel", subject: "c1", anchor: "a1", book: "b1", page: "p1" }

test("開くと置き、閉じると消す。ほかの画面の状態は残す", () => {
  const opened = withPanel({ commentDraft: { anchors: ["x"] } }, OPEN)
  expect(panelIn(opened)).toEqual(OPEN)
  expect(withPanel(opened, null)).toEqual({ commentDraft: { anchors: ["x"] } })
  expect(panelIn(undefined)).toBeNull()
})

test("開いたときのブックとページを開いている間だけ、開いたままにする", () => {
  expect(stillOn(OPEN, { opened: { book: "b1", page: "p1" } as never })).toBe(true)
  expect(stillOn(OPEN, { opened: { book: "b1", page: "p2" } as never })).toBe(false)
  expect(stillOn(OPEN, { opened: { book: "b2", page: "p1" } as never })).toBe(false)
  expect(stillOn(OPEN, { opened: null })).toBe(false)
})
