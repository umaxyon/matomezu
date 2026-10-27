// ツリーのブック（@matomezu/tree）: 作ってページを足すと紙が出る。置けるアイテムは無い
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render, screen } from "@testing-library/react"
import { addPageIn, createBookIn } from "../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

test("ツリーのブックを作ってページを足すと、紙が出る。道具箱に置けるアイテムは無い", () => {
  const store = createMatomezu({ home: "@matomezu/master:master", lang: "ja", plugins: BUILTIN_UI })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  act(() => {
    expect(createBookIn(store, "s1", { title: "木", type: "@matomezu/tree:tree" })).toBe(true)
  })
  act(() => {
    expect(addPageIn(store, "s1", { title: "p1" })).toBe(true)
  })
  const id = (store.state.getState().workspace.stages[0]!.opened as { book: string }).book
  expect(store.state.getState().books[id]).toMatchObject({ type: "@matomezu/tree:tree", title: "木" })
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["p1"])
  expect(screen.getByRole("img", { name: "紙" })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "箱" })).toBeNull()
})
