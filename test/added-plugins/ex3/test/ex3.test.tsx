import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { addPageIn, createBookIn } from "matomezu"
import {
  BUILTIN_UI,
  createMatomezu,
  DEFAULT_LAYOUT,
  MatomezuProvider,
  openedIn,
  placeAdded,
  WindowRoot,
} from "matomezu/testing"
import { pagesOf } from "../../../../web/src/core/book"
import EX3_UI from "../ui"

afterEach(cleanup)

// ex3 だけでも組める（ほかの見本が無くても動く）
const make = () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, EX3_UI],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  return instance
}

const board = (instance: ReturnType<typeof make>) => {
  act(() => {
    expect(createBookIn(instance, "s1", { title: "ボード" })).toBe(true)
  })
  const book = (openedIn(instance) as { book: string }).book
  act(() => {
    expect(addPageIn(instance, "s1", { type: "ex3:board", title: "p1" })).toBe(true)
  })
  const page = () =>
    pagesOf(
      instance.state.getState().books[book] as unknown as {
        pages: { id: string; paper: string; items?: { id: string }[] }[]
      },
    )[0]!
  return { on: { book }, page }
}

test("ボードは自分の紙（正方形）で始まり、星とビルトインのリストを置いて線でつなぎ、方眼の設定を変えられる", () => {
  const instance = make()
  const { on, page } = board(instance)
  expect(page().paper).toBe("ex3:square")
  act(() => {
    instance.actions.perform(
      "@matomezu/paper:item-place",
      { page: page().id, item: "ex3:star", at: { x: 40, y: 40 }, props: { caption: "目標", points: 6 } },
      on,
    )
    instance.actions.perform(
      "@matomezu/paper:item-place",
      { page: page().id, item: "@matomezu/list:shape-list", at: { x: 300, y: 40 } },
      on,
    )
  })
  const [s, l] = page().items!.map(i => i.id)
  act(() => {
    expect(
      instance.actions.perform("@matomezu/line:line-connect", { page: page().id, from: s!, to: l! }, on),
    ).toMatchObject({
      ok: true,
    })
    expect(
      instance.actions.perform(
        "@matomezu/base:pages-update",
        { pages: "all", settings: { "ex3:board-grid": true } },
        on,
      ),
    ).toMatchObject({
      ok: true,
    })
  })
  expect(instance.state.getState().books[on.book]).toMatchObject({ settings: { "ex3:board-grid": true } })
  expect(document.querySelector("[data-ex3-star]")?.getAttribute("data-ex3-star")).toBe("6")
})

test("既定のテーマはミントで、置いてほしいと書いたボタンで、開いているブックをミントにする", () => {
  const instance = make()
  act(() => {
    createBookIn(instance, "s1", { title: "図面" })
  })
  const book = (openedIn(instance) as { book: string }).book
  fireEvent.click(screen.getByRole("button", { name: "ミントにする" }))
  expect(instance.state.getState().books[book]).toMatchObject({ settings: { "@matomezu/base:page-theme": "ex3:mint" } })
})

test("持ち込んだスキンを、利用者の設定で選べる", () => {
  const instance = make()
  act(() => {
    const values = { "@matomezu/base:skin": "ex3:night" }
    expect(instance.actions.perform("@matomezu/base:settings-set", { values })).toMatchObject({ ok: true })
  })
  expect(document.documentElement.dataset.skin).toBe("ex3:night")
})
