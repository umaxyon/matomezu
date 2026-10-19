import { expect, test } from "bun:test"
import { currentStage } from "../../web/src/core/workspace"
import { createAppStore } from "../../web/src/store/store"

test("ページを足すと、そのステージのブックに入り、そのステージで開いてカレントになる", () => {
  const { state, actions } = createAppStore()
  actions.split()
  actions.addPage("s2")
  const s = state.getState()
  expect(s.books.b1!.pages.map(p => p.id)).toEqual(["p1", "p2"])
  expect(s.workspace.stages.map(st => st.page)).toEqual(["p1", "p2"])
  expect(currentStage(s.workspace).id).toBe("s2")
})

test("ページを開くのは指定したステージで、そのステージがカレントになる", () => {
  const { state, actions } = createAppStore()
  actions.addPage("s1")
  actions.split()
  actions.openPage("s2", "p1")
  const ws = state.getState().workspace
  expect(ws.stages.map(st => st.page)).toEqual(["p2", "p1"])
  expect(currentStage(ws).id).toBe("s2")
})

test("変わらない操作では知らせない", () => {
  const { state, actions } = createAppStore()
  let calls = 0
  const off = state.subscribe(() => calls++)
  actions.focusStage("s1")
  actions.unsplit()
  off()
  expect(calls).toBe(0)
})

test("store が持つずらす量は、表示領域の大きさで範囲に収めた値", () => {
  const { state, actions } = createAppStore()
  actions.resizeStage("s1", { w: 400, h: 300 })
  actions.panStageBy("s1", 500, 500)
  expect(state.getState().workspace.stages[0]!.pan).toEqual({ x: 0, y: 0 })
})
