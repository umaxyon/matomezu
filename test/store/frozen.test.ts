// 状態は凍っていて、その場で書き換えると誤りになる（前の状態と変わらない所を共有しているので、書き換えると前の状態まで変わる）。
// アクションで変えたあとの新しいブックも、作ったときに渡したブックも同じ
import { expect, test } from "bun:test"
import { newStore } from "../support"

test("状態のブックは、作ったときのものもアクションのあとのものも中まで凍っていて、書き換えると誤りになる", () => {
  const { state, actions } = newStore()
  const before = state.getState().books.b1
  expect(Object.isFrozen(before)).toBe(true)
  expect(actions.perform("@matomezu/base:book-update", { title: "新しい名前" }, { book: "b1" }).ok).toBe(true)
  const after = state.getState().books.b1 as { title: string; pages: readonly { title: string }[] }
  expect(Object.isFrozen(after)).toBe(true)
  expect(Object.isFrozen(after.pages[0])).toBe(true)
  expect(() => {
    ;(after as { title: string }).title = "x"
  }).toThrow()
  expect(() => {
    ;(after.pages as { title: string }[]).push({ title: "x" })
  }).toThrow()
  expect((before as { title: string }).title).not.toBe("新しい名前")
})

test("設定と画面の状態も凍っている", () => {
  const { state } = newStore()
  expect(Object.isFrozen(state.getState().settings)).toBe(true)
  expect(Object.isFrozen(state.getState().workspace.stages)).toBe(true)
})
