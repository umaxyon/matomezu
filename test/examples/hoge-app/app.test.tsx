import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { HogeApp, makeApp } from "./App"

afterEach(cleanup)

test("型の表に書き足したプラグインのコマンドを、型のまま自分のボタンから呼べる", () => {
  const app = makeApp()
  render(<HogeApp app={app} />)
  fireEvent.click(screen.getByRole("button", { name: "hoge" }))
  expect(app.state.getState().workspace.stages).toHaveLength(2)
  expect(screen.getByRole("dialog", { name: "hoge" }).textContent).toContain("こんにちは、MATOMEZU")
  fireEvent.click(screen.getByRole("button", { name: "english" }))
  expect(app.state.getState().settings.lang).toBe("en")
  // 自分の文言も、言語に合わせて出る
  expect(screen.getByRole("dialog", { name: "hoge" }).textContent).toContain("hello, MATOMEZU")
})

test("中の部品のダイアログを、自分のものに差し替えられる", () => {
  const app = makeApp()
  render(<HogeApp app={app} />)
  act(() => app.actions.openDialog("s1", "book.new"))
  expect(screen.getByRole("dialog", { name: "新しいブックの代わり" })).toBeTruthy()
})
