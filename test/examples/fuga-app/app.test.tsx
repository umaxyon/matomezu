import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { FugaApp, makeApp } from "./App"

afterEach(cleanup)

test("ビルトインプラグインと fuga だけのインスタンスでも、fuga のボードを作って星を置き、ミントのボタンが働く", () => {
  const app = makeApp()
  render(<FugaApp app={app} />)
  act(() => {
    expect(app.actions.createBook("s1", { title: "ボード", type: "fuga/board" })).toBe(true)
    expect(app.actions.addPage("s1", { title: "p1" })).toBe(true)
  })
  const id = (app.state.getState().workspace.stages[0]!.opened as { book: string }).book
  const page = (app.state.getState().books[id] as { pages: { id: string }[] }).pages[0]!.id
  act(() => {
    expect(
      app.actions.perform(
        "item.place",
        { page, item: "fuga/star", at: { x: 40, y: 40 }, props: { caption: "星" } },
        { book: id },
      ),
    ).toMatchObject({ ok: true })
  })
  expect(document.querySelector("[data-fuga-star]")?.getAttribute("data-fuga-star")).toBe("5")
  act(() => {
    app.actions.perform("book.update", { theme: "standard" }, { book: id })
  })
  fireEvent.click(screen.getByRole("button", { name: "fuga のミントにする" }))
  expect(app.state.getState().books[id]).toMatchObject({ theme: "fuga/mint" })
  expect(app.catalog.core.bookTypes.has("hoge-flow/flow")).toBe(false)
})
