// 右サイドパネルの持ち方: base のステージの画面の状態の rightSidePanel に持ち、ほかの物は残す。開いたときのブックかページから替われば閉じる
import { expect, test } from "bun:test"
import {
  closesOnRelease,
  columnGrow,
  followSelection,
  panelIn,
  pointedSelection,
  pressCloses,
  revealFor,
  stillOn,
  withoutAnchor,
  withPanel,
} from "../../web/src/plugins/base/right-side-panel/state"

const OPEN = { widget: "p:panel", subject: "c1", anchors: ["a1"], current: "a1", book: "b1", page: "p1" }

test("開くと置き、閉じると消す。ほかの画面の状態は残す", () => {
  const opened = withPanel({ noteDraft: { anchors: ["x"] } }, OPEN)
  expect(panelIn(opened)).toEqual(OPEN)
  expect(withPanel(opened, null)).toEqual({ noteDraft: { anchors: ["x"] } })
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

test("外を左ボタンで押したときだけ閉じる。中・閉じない所・ずらす道具の間・ほかのボタン・選択に従う中身の開いたステージの中では閉じない", () => {
  const out = { button: 0, inside: false, kept: false, pans: false, followed: false }
  expect(pressCloses(out)).toBe(true)
  expect(pressCloses({ ...out, button: 2 })).toBe(false)
  expect(pressCloses({ ...out, inside: true })).toBe(false)
  expect(pressCloses({ ...out, kept: true })).toBe(false)
  expect(pressCloses({ ...out, pans: true })).toBe(false)
  expect(pressCloses({ ...out, followed: true })).toBe(false)
})

test("選択に従う中身は、付いた先を選択に合わせる。カレントは新しく足された物の最後、無ければ今のカレント（残っていれば）、無ければ選択の最後", () => {
  const open = { ...OPEN, anchors: ["a", "b"], current: "b" }
  expect(followSelection(open, ["a", "b"])).toBe(open)
  expect(followSelection(open, ["a", "b", "c"])).toMatchObject({ anchors: ["a", "b", "c"], current: "c" })
  expect(followSelection(open, ["b"])).toMatchObject({ anchors: ["b"], current: "b" })
  expect(followSelection(open, ["a"])).toMatchObject({ anchors: ["a"], current: "a" })
  expect(followSelection({ ...open, current: "a" }, ["a", "b"])).toEqual({ ...open, current: "a" })
  expect(followSelection(open, [])).toMatchObject({ anchors: [], current: "b" })
})

test("見せ直し: 付いた先が替われば全部を収め、カレントだけ替われば倍率そのままでカレントへ。同じなら見せ直さない", () => {
  expect(revealFor(null, { anchors: ["a"], current: "a" })).toBe("anchors")
  expect(revealFor({ anchors: ["a"], current: "a" }, { anchors: ["a", "b"], current: "b" })).toBe("anchors")
  expect(revealFor({ anchors: ["a", "b"], current: "b" }, { anchors: ["a", "b"], current: "a" })).toBe("current")
  expect(revealFor({ anchors: ["a", "b"], current: "b" }, { anchors: ["a", "b"], current: "b" })).toBe("none")
  expect(revealFor({ anchors: ["a"], current: "a" }, { anchors: [], current: "a" })).toBe("none")
})

test("付いた先から外すと、外した物がカレントなら一つ前の物（無ければ残りの最初）がカレントになる", () => {
  const open = { ...OPEN, anchors: ["a", "b", "c"], current: "b" }
  expect(withoutAnchor(open, "b")).toMatchObject({ anchors: ["a", "c"], current: "a" })
  expect(withoutAnchor(open, "c")).toMatchObject({ anchors: ["a", "b"], current: "b" })
  expect(withoutAnchor({ ...open, current: "a" }, "a")).toMatchObject({ anchors: ["b", "c"], current: "b" })
  expect(withoutAnchor({ ...open, anchors: ["a"], current: "a" }, "a")).toMatchObject({ anchors: [] })
  expect(withoutAnchor(open, "x")).toBe(open)
})

test("離したあとに閉じるのは、開いたステージの中を押して、付いた先が空になったときだけ（右サイドパネルの中を押したときや、AI が消して空になったときは閉じない）", () => {
  expect(closesOnRelease({ pressedInStage: true, anchors: [] })).toBe(true)
  expect(closesOnRelease({ pressedInStage: false, anchors: [] })).toBe(false)
  expect(closesOnRelease({ pressedInStage: true, anchors: ["a"] })).toBe(false)
})

test("選択に従う中身を出している間に物を押すと、修飾なしならその物だけ、Mod なら足すか外す", () => {
  expect(pointedSelection(["a", "b"], "c", false)).toEqual(["c"])
  expect(pointedSelection(["a"], "b", true)).toEqual(["a", "b"])
  expect(pointedSelection(["a", "b"], "a", true)).toEqual(["b"])
})
