// 右サイドパネルの持ち方: base のステージの画面の状態の rightSidePanel に持ち、ほかの物は残す。開いたときのブックかページから替われば閉じる
import { expect, test } from "bun:test"
import { columnGrow, panelIn, pressCloses, stillOn, withPanel } from "../../web/src/plugins/base/right-side-panel/state"

const OPEN = { widget: "p:panel", subject: "c1", anchor: "a1", book: "b1", page: "p1" }

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

test("開いている間は、開いたステージの列が 1・もう片方が 0。閉じていれば分けた割合", () => {
  expect(columnGrow("s1", 0, "s2", 0.3)).toBe(0)
  expect(columnGrow("s2", 1, "s2", 0.3)).toBe(1)
  expect(columnGrow("s1", 0, null, 0.3)).toBe(0.3)
  expect(columnGrow("s2", 1, null, 0.3)).toBeCloseTo(0.7)
})

test("外を左ボタンで押したときだけ閉じる。中・閉じない所・ずらす道具の間・ほかのボタンでは閉じない", () => {
  const out = { button: 0, inside: false, kept: false, pans: false }
  expect(pressCloses(out)).toBe(true)
  expect(pressCloses({ ...out, button: 2 })).toBe(false)
  expect(pressCloses({ ...out, inside: true })).toBe(false)
  expect(pressCloses({ ...out, kept: true })).toBe(false)
  expect(pressCloses({ ...out, pans: true })).toBe(false)
})
