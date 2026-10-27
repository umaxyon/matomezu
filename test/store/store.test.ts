import { expect, test } from "bun:test"
import { currentStage } from "../../web/src/core/workspace"
import { addPageIn, createBookIn } from "../../web/src/plugins/base"
import { newStore } from "../support"

test("ページを足すと、そのステージのブックに入り、そのステージで開いてカレントになる", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  actions.openBook("s2", "b1")
  addPageIn({ state, actions }, "s2", { title: "ページ 2" })
  const s = state.getState()
  expect(s.books.b1).toMatchObject({ pages: [{ id: "p1" }, { id: "n1" }] })
  expect(s.workspace.stages.map(st => st.opened)).toMatchObject([{ page: "p1" }, { page: "n1" }])
  expect(currentStage(s.workspace).id).toBe("s2")
})

test("ページを開くのは指定したステージで、そのステージがカレントになる", () => {
  const { state, actions } = newStore()
  addPageIn({ state, actions }, "s1", { title: "ページ 2" })
  actions.split("s1")
  actions.openBook("s2", "b1")
  actions.openPage("s2", "p1")
  actions.openPage("s1", "n1")
  const ws = state.getState().workspace
  expect(ws.stages.map(st => st.opened)).toMatchObject([{ page: "n1" }, { page: "p1" }])
  expect(currentStage(ws).id).toBe("s1")
})

test("分けたステージは何も開いておらず、ブックを開くとそのステージがカレントになる", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  expect(state.getState().workspace.stages[1]!.opened).toBeNull()
  actions.openBook("s2", "b3")
  const ws = state.getState().workspace
  expect(ws.stages[1]!.opened).toMatchObject({
    type: "@matomezu/drawing:drawing",
    book: "b3",
    page: "p1",
    paper: { status: "known" },
  })
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
  actions.command("s2", "@matomezu/base:stage-home")
  const s = state.getState()
  expect(s.workspace.stages.map(st => st.opened?.type)).toEqual([
    "@matomezu/drawing:drawing",
    "@matomezu/master:master",
  ])
  expect(addPageIn({ state, actions }, "s2", { title: "x" })).toBe(false)
  expect(state.getState()).toBe(s)
})

test("ブックを作ると、振った id で一覧に入り、そのステージでページの無いまま開く。名前が空なら作らない", () => {
  const { state, actions } = newStore({ newId: () => "made" })
  actions.split("s1")
  expect(createBookIn({ state, actions }, "s2", { title: " ", type: "@matomezu/drawing:drawing" })).toBe(false)
  expect(createBookIn({ state, actions }, "s2", { title: "新しい図", type: "@matomezu/drawing:drawing" })).toBe(true)
  const s = state.getState()
  expect(s.books.made).toEqual({ type: "@matomezu/drawing:drawing", id: "made", title: "新しい図", pages: [] })
  expect(s.workspace.stages[1]!.opened).toEqual({
    type: "@matomezu/drawing:drawing",
    book: "made",
    page: null,
    paper: null,
  })
  expect(s.workspace.current).toBe("s2")
  addPageIn({ state, actions }, "s2", { title: "最初", paper: "@matomezu/base:a3", orientation: "portrait" })
  expect(state.getState().workspace.stages[1]!.opened).toMatchObject({
    page: "made",
    paper: { size: { w: 1123, h: 1587 } },
  })
})

test("言語とスキンの設定を変える。同じ値なら知らせない", () => {
  const { state, actions } = newStore()
  actions.perform("@matomezu/base:settings-lang", { lang: "en" })
  actions.perform("@matomezu/base:settings-skin", { skin: "@matomezu/base:light" })
  expect(state.getState().settings).toMatchObject({ lang: "en", skin: "@matomezu/base:light" })
  const s = state.getState()
  actions.perform("@matomezu/base:settings-skin", { skin: "@matomezu/base:light" })
  expect(state.getState()).toBe(s)
})

test("ページの無いブックを 2 つのステージで開いて最初のページを作ると、どちらのステージもそのページを開く", () => {
  const { state, actions } = newStore()
  createBookIn({ state, actions }, "s1", { title: "空", type: "@matomezu/drawing:drawing" })
  actions.split("s1")
  actions.openBook("s2", "n1")
  addPageIn({ state, actions }, "s2", { title: "最初" })
  expect(state.getState().workspace.stages.map(st => st.opened?.page)).toEqual(["n2", "n2"])
  // ほかのページを見ているステージは変えない
  addPageIn({ state, actions }, "s2", { title: "次" })
  expect(state.getState().workspace.stages.map(st => st.opened?.page)).toEqual(["n2", "n3"])
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

test("右クリックのメニューは 1 つだけ出し、開いたステージが無くなれば閉じる。無いステージでは開かない", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  actions.openContextMenu("s1", "@matomezu/paper:paper-context", {}, { x: 10, y: 20 })
  actions.openContextMenu("s2", "@matomezu/paper:paper-context", {}, { x: 30, y: 40 })
  expect(state.getState().contextMenu).toEqual({
    id: "@matomezu/paper:paper-context",
    stage: "s2",
    target: {},
    at: { x: 30, y: 40 },
  })
  actions.closeStage("s2")
  expect(state.getState().contextMenu).toBeNull()
  actions.openContextMenu("s9", "@matomezu/paper:paper-context", {}, { x: 0, y: 0 })
  expect(state.getState().contextMenu).toBeNull()
  actions.openContextMenu("s1", "@matomezu/paper:paper-context", {}, { x: 0, y: 0 })
  actions.closeContextMenu()
  expect(state.getState().contextMenu).toBeNull()
})

test("ホストとの同期（receive）はインスタンスにあり、プラグインに渡す actions には無い（アクションを通さずに世界を入れ替えられないように）", () => {
  const instance = newStore()
  expect("receive" in instance.actions).toBe(false)
  expect(typeof instance.receive).toBe("function")
})

test("トーストは出した順に積み、id で消す（もう無い id なら何もしない）", () => {
  const { state, actions } = newStore()
  const a = actions.showToast({ kind: "warn", message: "@matomezu/flowchart:Does not fit on the paper" })
  const b = actions.showToast({ kind: "info", message: "@matomezu/flowchart:Auto align" })
  expect(a).not.toBe(b)
  expect(state.getState().toasts.map(t => t.id)).toEqual([a, b])
  actions.dismissToast(a)
  actions.dismissToast(a)
  expect(state.getState().toasts.map(t => t.id)).toEqual([b])
})
