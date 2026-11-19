// キーの受け口（ui/keys.ts）: テキストFormとボタンの中のキーは、その要素が自分で名乗った範囲だけで引き、名乗っていなければテキストForm・ボタンに任せる

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { pagesOf } from "../../web/src/core/book"
import { screenOf } from "../../web/src/core/window"
import { createBookIn } from "../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { KeyListener } from "../../web/src/ui/keys"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { showFirstBook } from "../support"

afterEach(cleanup)

test("親の要素だけが範囲を名乗るテキストFormでは Mod+Z をテキストFormに任せ、自分で名乗るテキストFormでは、その範囲の Mod+Z で元に戻す", async () => {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: BUILTIN_UI,
    partial: true,
  })
  showFirstBook(store)
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
    createBookIn(store, "s1", { title: "メモ" })
  })
  const id = screenOf(store.state.getState().window).stages[0]!.opened!.book
  act(() => {
    store.actions.perform("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title: "1" }, { book: id })
  })
  await act(() => Promise.resolve())
  const pages = () => {
    const book = store.state.getState().books[id]
    return book ? pagesOf(book).length : undefined
  }
  expect(pages()).toBe(1)
  expect(fireEvent.keyDown(screen.getByLabelText("親が名乗る"), { key: "z", ctrlKey: true })).toBe(true)
  expect(pages()).toBe(1)
  act(() => {
    expect(fireEvent.keyDown(screen.getByLabelText("自分で名乗る"), { key: "z", ctrlKey: true })).toBe(false)
  })
  expect(pages()).toBe(0)
})

test("焦点のあるボタンの Enter は、ボタンが自分で名乗った範囲だけで引き、引けたら押す動きを止める。親だけが名乗るボタン・キーバインドの無い範囲・Space は押す動きに任せる", () => {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: BUILTIN_UI,
    partial: true,
  })
  showFirstBook(store)
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <KeyListener />
      <button type="button" aria-label="自分で名乗る" data-key-scope="@matomezu/base:library-contents" />
      <div data-key-scope="@matomezu/base:library-contents">
        <button type="button" aria-label="親が名乗る" />
      </div>
      <button type="button" aria-label="Enter の無い範囲" data-key-scope="@matomezu/base:right-side-panel" />
    </MatomezuProvider>,
  )
  // fireEvent は、止めたら false を返す
  const press = (label: string, key: string) => fireEvent.keyDown(screen.getByLabelText(label), { key })
  expect(press("自分で名乗る", "Enter")).toBe(false)
  expect(press("親が名乗る", "Enter")).toBe(true)
  expect(press("Enter の無い範囲", "Enter")).toBe(true)
  expect(press("自分で名乗る", " ")).toBe(true)
})
