import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, Screen } from "matomezu/testing"
import EX1_UI from "../ui"

afterEach(cleanup)

// ビルトインプラグインと ex1 だけで組み、動いている matomezu の画面と同じく、置いてほしい所に置いた配置で描く
const make = () => {
  const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX1_UI], home: "@matomezu/master:master", lang: "ja" })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <Screen />
    </MatomezuProvider>,
  )
  return instance
}

test("置いてほしいと書いたボタンがステージの上の行に出て、自分のコマンドとダイアログが働く", () => {
  const instance = make()
  fireEvent.click(screen.getByRole("button", { name: "あいさつする" }))
  expect(screen.getByRole("dialog", { name: "あいさつする" }).textContent).toContain("こんにちは、MATOMEZU")
  // 引数のあるコマンドで言語を変えると、自分の文言も変わる
  fireEvent.click(screen.getByRole("button", { name: "言語を切り替える" }))
  expect(instance.state.getState().settings.lang).toBe("en")
  expect(screen.getByRole("dialog", { name: "Say hello" }).textContent).toContain("Hello, MATOMEZU")
})

test("持ち込んだ言語で、自分の文言もビルトインの文言も訳される", () => {
  const instance = make()
  expect(instance.catalog.core.languages.get("fr")).toBe("Français")
  act(() => {
    instance.actions.command("s1", "ex1:lang", "fr")
  })
  expect(screen.getByRole("button", { name: "Dire bonjour" })).toBeTruthy()
})

test("右クリックされたアイテムを受け取るコマンドを、そのアイテムのダイアログに渡す", () => {
  const instance = make()
  act(() => {
    instance.actions.command("s1", "ex1:inspect", { item: "a1" })
  })
  expect(screen.getByRole("dialog", { name: "アイテムを調べる" }).textContent).toContain("アイテム a1")
})

test("ビルトインのダイアログを、自分のものに差し替えられる", () => {
  const instance = make()
  act(() => instance.actions.openDialog("s1", "@matomezu/base:page-settings", { page: "p1" }))
  expect(screen.getByRole("dialog", { name: "ex1 のページの設定" })).toBeTruthy()
})

test("置いてほしいメニューと、既定のキーが入る", () => {
  const instance = make()
  const layout = placeAdded(DEFAULT_LAYOUT, instance.plugins)
  expect(layout.menus["@matomezu/base:stage-menu"]?.at(-1)).toBe("ex1:hello")
  expect(layout.contextMenus?.["@matomezu/paper:item-context"]?.slice(-2)).toEqual(["-", "ex1:inspect"])
  expect([...instance.catalog.store.keys.values()].map(k => k.binding.command)).toContain("ex1:hello")
})
