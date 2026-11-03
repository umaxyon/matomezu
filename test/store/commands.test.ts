import { describe, expect, test } from "bun:test"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN } from "../../web/src/plugins"
import { isActive, isShown } from "../../web/src/store/commands"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin } from "../../web/src/store/plugin"
import { createMatomezuInstance } from "../../web/src/store/store"
import { SAMPLE_BOOKS } from "../sample-books"
import { newStore, sequence } from "../support"

describe("コマンドを出すかは、呼んだ場所の様子で決まる", () => {
  test("分割していなければ分割を出し、分割していれば、やめると閉じるを出す", () => {
    const store = newStore()
    const { state, actions } = store
    const shown = () =>
      ["@matomezu/base:stage-split", "@matomezu/base:stage-unsplit", "@matomezu/base:stage-close"].filter(id =>
        isShown(store, state.getState(), "s1", id as never),
      )
    expect(shown()).toEqual(["@matomezu/base:stage-split"])
    actions.command("s1", "@matomezu/base:stage-split")
    expect(shown()).toEqual(["@matomezu/base:stage-unsplit", "@matomezu/base:stage-close"])
  })

  test("ブックを作るのはマスター、ページを作るのはページを足せるブックを開いているときだけ", () => {
    const store = newStore()
    const { state, actions } = store
    expect(isShown(store, state.getState(), "s1", "@matomezu/base:book-new")).toBe(false)
    expect(isShown(store, state.getState(), "s1", "@matomezu/base:page-new")).toBe(true)
    actions.command("s1", "@matomezu/base:stage-home")
    expect(isShown(store, state.getState(), "s1", "@matomezu/base:book-new")).toBe(true)
    expect(isShown(store, state.getState(), "s1", "@matomezu/base:page-new")).toBe(false)
  })

  test("無いステージからは、どのコマンドも出さない", () => {
    const store = newStore()
    const { state } = store
    expect(
      [...store.catalog.store.commands.keys()].filter(id => isShown(store, state.getState(), "nope", id as never)),
    ).toEqual([])
  })
})

describe("コマンドを行う", () => {
  test("出ていないコマンドは行わない", () => {
    const { state, actions } = newStore()
    expect(actions.command("s1", "@matomezu/base:stage-unsplit")).toBe(false)
    expect(actions.command("s1", "@matomezu/base:book-new")).toBe(false)
    expect(state.getState().dialog).toBeNull()
  })

  test("引数のあるコマンドは、その値で行う", () => {
    const { state, actions } = newStore()
    expect(actions.command("s1", "@matomezu/base:settings-set", { "@matomezu/base:lang": "matomezu:en" })).toBe(true)
    expect(actions.command("s1", "@matomezu/base:page-open", "p1")).toBe(true)
    expect(state.getState().lang).toBe("en")
  })

  test("ダイアログのコマンドは、呼んだステージから開いたダイアログにする", () => {
    const { state, actions } = newStore()
    actions.command("s1", "@matomezu/base:stage-split")
    actions.command("s2", "@matomezu/base:book-open")
    expect(state.getState().dialog).toMatchObject({ id: "@matomezu/base:book-open", stage: "s2" })
    actions.closeDialog()
    expect(state.getState().dialog).toBeNull()
  })

  test("開いたステージが閉じたらダイアログも閉じ、ほかのステージが閉じても残る", () => {
    const { state, actions } = newStore()
    actions.command("s1", "@matomezu/base:stage-split")
    actions.command("s2", "@matomezu/base:book-open")
    actions.command("s1", "@matomezu/base:stage-close")
    expect(state.getState().dialog).toMatchObject({ id: "@matomezu/base:book-open", stage: "s2" })
    actions.command("s2", "@matomezu/base:stage-split")
    const added = state.getState().workspace.stages[1]!.id
    actions.command(added, "@matomezu/base:book-open")
    actions.command(added, "@matomezu/base:stage-close")
    expect(state.getState().dialog).toBeNull()
  })

  test("引数の型はコマンドで決まる（型を確かめるだけで、行わない）", () => {
    const { actions } = newStore()
    const typeOnly = () => {
      // @ts-expect-error page-open にはページの id を渡す
      actions.command("s1", "@matomezu/base:page-open")
      // @ts-expect-error stage-split は引数を取らない
      actions.command("s1", "@matomezu/base:stage-split", "x")
      // @ts-expect-error 表に無いコマンド
      actions.command("s1", "stage.nope")
    }
    expect(typeOnly).toBeFunction()
  })
})

describe("コマンドは、自分のプラグインが持つステージの画面の状態を文脈で読み、run が受け取る updateStageState で変える", () => {
  const kit = pluginKit("@x/pane", defineMessages({ toggle: { en: "Toggle", ja: "切り替え" } }))
  const TOGGLE = kit.defineCommand({
    id: "toggle",
    title: "toggle",
    run: (_, a) => a.updateStageState(now => (now === "split" ? undefined : "split")),
    when: ctx => ctx.stageState !== "hidden",
    active: ctx => ctx.stageState === "split",
  })
  const newPaneStore = () =>
    createMatomezuInstance({
      plugins: [...BUILTIN, definePlugin(kit.plugin({ commands: [TOGGLE] }))],
      home: "@matomezu/master:master",
      books: SAMPLE_BOOKS,
      lang: "ja",
      newId: sequence(),
    })

  test("run で置いた値を、そのステージの when・active が読む。ほかのステージには効かない", () => {
    const store = newPaneStore()
    const { state, actions } = store
    // 表に無い id（型に書き足していない追加プラグインのコマンド）を呼ぶ
    const toggle = (stage: string) =>
      (actions.command as (stage: string, id: string) => boolean)(stage, "@x/pane:toggle")
    actions.split("s1")
    toggle("s1")
    expect(state.getState().stageStates).toEqual({ s1: { "@x/pane": "split" } })
    expect(isActive(store, state.getState(), "s1", "@x/pane:toggle" as never)).toBe(true)
    expect(isActive(store, state.getState(), "s2", "@x/pane:toggle" as never)).toBe(false)
    toggle("s1")
    expect(state.getState().stageStates.s1).toEqual({})
  })

  test("読むのは自分の置き場だけ（ほかのプラグインの置き場の値は見えない）", () => {
    const store = newPaneStore()
    store.setStageState("s1", "@x/other", "hidden")
    expect(isShown(store, store.state.getState(), "s1", "@x/pane:toggle" as never)).toBe(true)
    store.setStageState("s1", "@x/pane", "hidden")
    expect(isShown(store, store.state.getState(), "s1", "@x/pane:toggle" as never)).toBe(false)
  })
})
