import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, Screen } from "matomezu/testing"
import EX3_UI from "../ui"

afterEach(cleanup)

// ex3 だけでも組める（ほかの見本が無くても動く）
const make = () => {
  const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX3_UI], home: "master", lang: "ja" })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <Screen />
    </MatomezuProvider>,
  )
  return instance
}

const board = (instance: ReturnType<typeof make>) => {
  act(() => {
    expect(instance.actions.createBook("s1", { title: "ボード", type: "ex3/board" })).toBe(true)
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(instance.actions.addPage("s1", { title: "p1" })).toBe(true)
  })
  const page = () =>
    (
      instance.state.getState().books[book] as unknown as {
        pages: { id: string; paper: string; items?: { id: string }[] }[]
      }
    ).pages[0]!
  return { on: { book }, page }
}

test("ボードは自分の紙（正方形）で始まり、星とビルトインのリストを置いて線でつなぎ、方眼の設定を変えられる", () => {
  const instance = make()
  const { on, page } = board(instance)
  expect(page().paper).toBe("ex3/square")
  act(() => {
    instance.actions.perform(
      "item.place",
      { page: page().id, item: "ex3/star", at: { x: 40, y: 40 }, props: { caption: "目標", points: 6 } },
      on,
    )
    instance.actions.perform("item.place", { page: page().id, item: "shape.list", at: { x: 300, y: 40 } }, on)
  })
  const [s, l] = page().items!.map(i => i.id)
  act(() => {
    expect(instance.actions.perform("line.connect", { page: page().id, from: s!, to: l! }, on)).toMatchObject({
      ok: true,
    })
    expect(instance.actions.perform("book.update", { settings: { ex3Grid: true } }, on)).toMatchObject({ ok: true })
  })
  expect(instance.state.getState().books[on.book]).toMatchObject({ ex3Grid: true })
  expect(document.querySelector("[data-ex3-star]")?.getAttribute("data-ex3-star")).toBe("6")
})

test("既定のテーマはミントで、置いてほしいと書いたボタンで、開いているブックをミントにする", () => {
  const instance = make()
  act(() => {
    instance.actions.createBook("s1", { title: "図面", type: "drawing" })
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  fireEvent.click(screen.getByRole("button", { name: "ミントにする" }))
  expect(instance.state.getState().books[book]).toMatchObject({ theme: "ex3/mint" })
})

test("持ち込んだスキンを、見る人の設定で選べる", () => {
  const instance = make()
  act(() => {
    expect(instance.actions.perform("settings.skin", { skin: "ex3/night" })).toMatchObject({ ok: true })
  })
  expect(instance.state.getState().settings.skin).toBe("ex3/night")
})
