import { describe, expect, test } from "bun:test"
import { REGISTRY } from "../../web/src/core/registry"
import { COMMANDS, isShown } from "../../web/src/store/commands"
import { createAppStore } from "../../web/src/store/store"

test("コマンドの id は重ならない", () => {
  const ids = COMMANDS.map(c => c.id)
  expect(new Set(ids).size).toBe(ids.length)
})

describe("コマンドを出すかは、呼んだ場所の様子で決まる", () => {
  test("分割していなければ分割を出し、分割していれば、やめると閉じるを出す", () => {
    const { state, actions } = createAppStore()
    const shown = () =>
      ["stage.split", "stage.unsplit", "stage.close"].filter(id =>
        isShown(REGISTRY, state.getState(), "s1", id as never),
      )
    expect(shown()).toEqual(["stage.split"])
    actions.command("s1", "stage.split")
    expect(shown()).toEqual(["stage.unsplit", "stage.close"])
  })

  test("ブックを作るのはマスター、ページを作るのはページを足せるブックを開いているときだけ", () => {
    const { state, actions } = createAppStore()
    expect(isShown(REGISTRY, state.getState(), "s1", "book.new")).toBe(false)
    expect(isShown(REGISTRY, state.getState(), "s1", "page.new")).toBe(true)
    actions.command("s1", "stage.master")
    expect(isShown(REGISTRY, state.getState(), "s1", "book.new")).toBe(true)
    expect(isShown(REGISTRY, state.getState(), "s1", "page.new")).toBe(false)
  })

  test("無いステージからは、どのコマンドも出さない", () => {
    const { state } = createAppStore()
    expect(COMMANDS.filter(c => isShown(REGISTRY, state.getState(), "nope", c.id))).toEqual([])
  })
})

describe("コマンドを行う", () => {
  test("出ていないコマンドは行わない", () => {
    const { state, actions } = createAppStore()
    expect(actions.command("s1", "stage.unsplit")).toBe(false)
    expect(actions.command("s1", "book.new")).toBe(false)
    expect(state.getState().dialog).toBeNull()
  })

  test("引数のあるコマンドは、その値で行う", () => {
    const { state, actions } = createAppStore()
    expect(actions.command("s1", "settings.lang", "en")).toBe(true)
    expect(actions.command("s1", "page.open", "p1")).toBe(true)
    expect(state.getState().settings.lang).toBe("en")
  })

  test("ダイアログのコマンドは、呼んだステージから開いたダイアログにする", () => {
    const { state, actions } = createAppStore()
    actions.command("s1", "stage.split")
    actions.command("s2", "book.open")
    expect(state.getState().dialog).toEqual({ id: "book.open", stage: "s2" })
    actions.closeDialog()
    expect(state.getState().dialog).toBeNull()
  })

  test("開いたステージが閉じたらダイアログも閉じ、ほかのステージが閉じても残る", () => {
    const { state, actions } = createAppStore()
    actions.command("s1", "stage.split")
    actions.command("s2", "book.open")
    actions.command("s1", "stage.close")
    expect(state.getState().dialog).toEqual({ id: "book.open", stage: "s2" })
    actions.command("s2", "stage.split")
    const added = state.getState().workspace.stages[1]!.id
    actions.command(added, "book.open")
    actions.command(added, "stage.close")
    expect(state.getState().dialog).toBeNull()
  })

  test("引数の型はコマンドで決まる（型を確かめるだけで、行わない）", () => {
    const { actions } = createAppStore()
    const typeOnly = () => {
      // @ts-expect-error page.open にはページの id を渡す
      actions.command("s1", "page.open")
      // @ts-expect-error stage.split は引数を取らない
      actions.command("s1", "stage.split", "x")
      // @ts-expect-error 言語は決まった値だけ
      actions.command("s1", "settings.lang", "fr")
      // @ts-expect-error 表に無いコマンド
      actions.command("s1", "stage.nope")
    }
    expect(typeOnly).toBeFunction()
  })
})
