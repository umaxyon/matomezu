import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { HogeApp, makeApp } from "./App"

afterEach(cleanup)

test("自分のウィジェットを配置でステージに置き、そこから自分のコマンドを型のまま呼べる", () => {
  const app = makeApp()
  render(<HogeApp app={app} />)
  fireEvent.click(screen.getByRole("button", { name: "hoge を開く" }))
  expect(app.state.getState().workspace.stages).toHaveLength(2)
  expect(screen.getByRole("dialog", { name: "hoge" }).textContent).toContain("こんにちは、MATOMEZU")
  // 分割したので、hoge のボタンはステージごとにある
  expect(screen.getAllByRole("button", { name: "hoge の言語" })).toHaveLength(2)
  fireEvent.click(screen.getAllByRole("button", { name: "hoge の言語" })[0]!)
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
