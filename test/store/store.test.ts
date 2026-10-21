import { expect, test } from "bun:test"
import { currentStage } from "../../web/src/core/workspace"
import { newStore } from "../support"

test("ページを足すと、そのステージのブックに入り、そのステージで開いてカレントになる", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  actions.openBook("s2", "b1")
  actions.addPage("s2", { title: "ページ 2" })
  const s = state.getState()
  expect(s.books.b1).toMatchObject({ pages: [{ id: "p1" }, { id: "p2" }] })
  expect(s.workspace.stages.map(st => st.opened)).toMatchObject([{ page: "p1" }, { page: "p2" }])
  expect(currentStage(s.workspace).id).toBe("s2")
})

test("ページを開くのは指定したステージで、そのステージがカレントになる", () => {
  const { state, actions } = newStore()
  actions.addPage("s1", { title: "ページ 2" })
  actions.split("s1")
  actions.openBook("s2", "b1")
  actions.openPage("s2", "p1")
  actions.openPage("s1", "p2")
  const ws = state.getState().workspace
  expect(ws.stages.map(st => st.opened)).toMatchObject([{ page: "p2" }, { page: "p1" }])
  expect(currentStage(ws).id).toBe("s1")
})

test("分けたステージは何も開いておらず、ブックを開くとそのステージがカレントになる", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  expect(state.getState().workspace.stages[1]!.opened).toBeNull()
  actions.openBook("s2", "b3")
  const ws = state.getState().workspace
  expect(ws.stages[1]!.opened).toMatchObject({ type: "drawing", book: "b3", page: "p1", paper: { status: "known" } })
  expect(ws.current).toBe("s2")
})

test("変わらない操作では知らせない", () => {
  const { state, actions } = newStore()
  let calls = 0
  const off = state.subscribe(() => calls++)
  actions.focusStage("s1")
  actions.unsplit("s1")
  off()
  expect(calls).toBe(0)
})

test("store が持つずらす量は、表示領域の大きさで範囲に収めた値", () => {
  const { state, actions } = newStore()
  actions.resizeStage("s1", { w: 400, h: 300 })
  actions.panStageBy("s1", 500, 500)
  expect(state.getState().workspace.stages[0]!.pan).toEqual({ x: 0, y: 0 })
})

test("マスターはカレントのステージで開き、ページは足せない", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  actions.focusStage("s2")
  actions.command("s2", "stage.home")
  const s = state.getState()
  expect(s.workspace.stages.map(st => st.opened?.type)).toEqual(["drawing", "master"])
  expect(actions.addPage("s2", { title: "x" })).toBe(false)
  expect(state.getState()).toBe(s)
})

test("ブックを作ると、振った id で一覧に入り、そのステージでページの無いまま開く。名前が空なら作らない", () => {
  const { state, actions } = newStore({ newId: () => "made" })
  actions.split("s1")
  expect(actions.createBook("s2", { title: " ", type: "drawing" })).toBe(false)
  expect(actions.createBook("s2", { title: "新しい図", type: "drawing" })).toBe(true)
  const s = state.getState()
  expect(s.books.made).toEqual({ type: "drawing", id: "made", title: "新しい図", pages: [] })
  expect(s.workspace.stages[1]!.opened).toEqual({ type: "drawing", book: "made", page: null, paper: null })
  expect(s.workspace.current).toBe("s2")
  actions.addPage("s2", { title: "最初", paper: "a3", orientation: "portrait" })
  expect(state.getState().workspace.stages[1]!.opened).toMatchObject({
    page: "p1",
    paper: { size: { w: 1123, h: 1587 } },
  })
})

test("言語とスキンの設定を変える。同じ値なら知らせない", () => {
  const { state, actions } = newStore()
  actions.setLang("en")
  actions.setSkin("light")
  expect(state.getState().settings).toEqual({ lang: "en", skin: "light" })
  const s = state.getState()
  actions.setSkin("light")
  expect(state.getState()).toBe(s)
})

test("ページの無いブックを 2 つのステージで開いて最初のページを作ると、どちらのステージもそのページを開く", () => {
  const { state, actions } = newStore({ newId: () => "made" })
  actions.createBook("s1", { title: "空", type: "drawing" })
  actions.split("s1")
  actions.openBook("s2", "made")
  actions.addPage("s2", { title: "最初" })
  expect(state.getState().workspace.stages.map(st => st.opened?.page)).toEqual(["p1", "p1"])
  // ほかのページを見ているステージは変えない
  actions.addPage("s2", { title: "次" })
  expect(state.getState().workspace.stages.map(st => st.opened?.page)).toEqual(["p1", "p2"])
})

test("閉じたステージへの分割と分割の取りやめは、ほかのステージにかけない", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  actions.closeStage("s2")
  actions.split("s1")
  const before = state.getState().workspace
  actions.unsplit("s2")
  actions.split("s2")
  expect(state.getState().workspace).toBe(before)
  expect(before.stages.map(s => s.id)).toEqual(["s1", "s3"])
})
