// キーの受け口（ui/keys.ts）: テキストFormの中のキーは、テキストFormが自分の要素で名乗った範囲だけで引き、名乗っていなければテキストFormに任せる
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createBookIn } from "../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { KeyListener } from "../../web/src/ui/keys"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

test("親の要素だけが範囲を名乗るテキストFormでは Mod+Z をテキストFormに任せ、自分で名乗るテキストFormでは、その範囲の Mod+Z で元に戻す", async () => {
  const store = createMatomezu({ home: "@matomezu/master:master", lang: "ja", plugins: BUILTIN_UI, partial: true })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <KeyListener />
      <div data-key-scope="@matomezu/base:right-side-panel">
        <textarea aria-label="親が名乗る" />
      </div>
      <textarea aria-label="自分で名乗る" data-key-scope="@matomezu/markdown:source" />
    </MatomezuProvider>,
  )
  act(() => {
    createBookIn(store, "s1", { title: "メモ", type: "@matomezu/markdown:markdown" })
  })
  const id = store.state.getState().workspace.stages[0]!.opened!.book
  act(() => {
    store.actions.perform("@matomezu/base:page-add", { title: "1" }, { book: id })
  })
  await act(() => Promise.resolve())
  const pages = () => (store.state.getState().books[id] as { pages?: readonly unknown[] } | undefined)?.pages?.length
  expect(pages()).toBe(1)
  expect(fireEvent.keyDown(screen.getByLabelText("親が名乗る"), { key: "z", ctrlKey: true })).toBe(true)
  expect(pages()).toBe(1)
  act(() => {
    expect(fireEvent.keyDown(screen.getByLabelText("自分で名乗る"), { key: "z", ctrlKey: true })).toBe(false)
  })
  expect(pages()).toBe(0)
})
