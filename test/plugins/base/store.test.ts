// base のページとブックを足す関数（addPageIn・createBookIn）と、設定を変えるアクション settings-set

import { expect, test } from "bun:test"
import { HOME_ID } from "../../../web/src/core/folders"
import { shownPageId, shownType } from "../../../web/src/core/stage"
import { screenOf } from "../../../web/src/core/window"
import { currentStage } from "../../../web/src/core/workspace"
import { addPageIn, createBookIn } from "../../../web/src/plugins/base"
import { newStore } from "../../support"

test("ページを足すと、そのステージのブックに入り、そのステージで開いてカレントになる", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  actions.openBook("s2", "b1")
  addPageIn({ state, actions }, "s2", { type: "@matomezu/drawing:drawing", title: "ページ 2" })
  const s = state.getState()
  expect(s.books.b1).toMatchObject({ lineup: [{ id: "p1" }, { id: "n1" }] })
  expect(screenOf(s.window).stages.map(st => st.opened)).toMatchObject([{ page: "p1" }, { page: "n1" }])
  expect(currentStage(screenOf(s.window)).id).toBe("s2")
})

test("ページを開くのは指定したステージで、そのステージがカレントになる", () => {
  const { state, actions } = newStore()
  addPageIn({ state, actions }, "s1", { type: "@matomezu/drawing:drawing", title: "ページ 2" })
  actions.split("s1")
  actions.openBook("s2", "b1")
  actions.openPage("s2", "p1")
  actions.openPage("s1", "n1")
  const ws = screenOf(state.getState().window)
  expect(ws.stages.map(st => st.opened)).toMatchObject([{ page: "n1" }, { page: "p1" }])
  expect(currentStage(ws).id).toBe("s1")
})

test("分けたステージは何も開いておらず、ブックを開くとそのステージがカレントになる", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  expect(screenOf(state.getState().window).stages[1]!.opened).toBeNull()
  actions.openBook("s2", "b3")
  const ws = screenOf(state.getState().window)
  expect(ws.stages[1]!.opened).toMatchObject({
    type: "@matomezu/drawing:drawing",
    outermost: { kind: "book", id: "b3" },
    page: "b3-p1",
    paper: { status: "known" },
  })
  expect(ws.current).toBe("s2")
})

test("ブックを開いていないステージには、ページは足せない", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  const s = state.getState()
  expect(screenOf(s.window).stages.map(st => shownType(st.opened ?? null))).toEqual(["@matomezu/drawing:drawing", null])
  expect(addPageIn({ state, actions }, "s2", { type: "@matomezu/drawing:drawing", title: "x" })).toBe(false)
  expect(state.getState()).toBe(s)
})

test("ブックを作ると、振った id で一覧に入り、そのステージでページの無いまま開く。名前が空なら作らない", () => {
  const ids = ["made", "first"]
  const { state, actions } = newStore({ newId: () => ids.shift() ?? "spare" })
  actions.split("s1")
  expect(createBookIn({ state, actions }, "s2", { into: HOME_ID, title: " " })).toBe(false)
  expect(createBookIn({ state, actions }, "s2", { into: HOME_ID, title: "新しい図" })).toBe(true)
  const s = state.getState()
  expect(s.books.made).toEqual({ id: "made", title: "新しい図", lineup: [] })
  expect(screenOf(s.window).stages[1]!.opened).toEqual({ kind: "none", outermost: { kind: "book", id: "made" } })
  expect(screenOf(s.window).current).toBe("s2")
  addPageIn({ state, actions }, "s2", {
    type: "@matomezu/drawing:drawing",
    title: "最初",
    paper: "@matomezu/base:a3",
    orientation: "portrait",
  })
  expect(screenOf(state.getState().window).stages[1]!.opened).toMatchObject({
    page: "first",
    paper: { size: { w: 1123, h: 1587 } },
  })
})

test("言語とスキンの設定を変える（書いた項目だけ変わり、null は既定に戻す）。同じ値なら知らせない", () => {
  const { state, actions } = newStore()
  const set = (values: Record<string, unknown>) => actions.perform("@matomezu/base:settings-set", { values }).ok
  expect(set({ "@matomezu/base:lang": "matomezu:en" })).toBe(true)
  expect(set({ "@matomezu/base:skin": "@matomezu/base:light" })).toBe(true)
  expect(state.getState().settings).toEqual({
    "@matomezu/base:lang": "matomezu:en",
    "@matomezu/base:skin": "@matomezu/base:light",
  })
  expect(state.getState().lang).toBe("en")
  const s = state.getState()
  expect(set({ "@matomezu/base:skin": "@matomezu/base:light" })).toBe(true)
  expect(state.getState()).toBe(s)
  // 無い項目・形の合わない値は断り、どれも変えない
  expect(set({ "@matomezu/base:lang": "matomezu:ja", "@gone/x:y": 1 })).toBe(false)
  expect(set({ "@matomezu/base:lang": "matomezu:ja", "@matomezu/base:skin": "nope" })).toBe(false)
  expect(state.getState()).toBe(s)
  expect(set({ "@matomezu/base:lang": null })).toBe(true)
  expect(state.getState().settings).toEqual({ "@matomezu/base:skin": "@matomezu/base:light" })
  expect(state.getState().lang).toBe("ja")
})

test("ページの無いブックを 2 つのステージで開いて最初のページを作ると、どちらのステージもそのページを開く", () => {
  const { state, actions } = newStore()
  createBookIn({ state, actions }, "s1", { into: HOME_ID, title: "空" })
  actions.split("s1")
  actions.openBook("s2", "n1")
  addPageIn({ state, actions }, "s2", { type: "@matomezu/drawing:drawing", title: "最初" })
  expect(screenOf(state.getState().window).stages.map(st => shownPageId(st.opened ?? null))).toEqual(["n2", "n2"])
  // ほかのページを見ているステージは変えない
  addPageIn({ state, actions }, "s2", { type: "@matomezu/drawing:drawing", title: "次" })
  expect(screenOf(state.getState().window).stages.map(st => shownPageId(st.opened ?? null))).toEqual(["n2", "n3"])
})
