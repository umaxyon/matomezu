// 設定画面: マスターのボタンから設定画面のダイアログを開き、左の項目（全体・ショートカットキー）を押すと右の欄が切り替わる
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { MASTER } from "../../web/src/plugins/books/master/master"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { SAMPLE_BOOKS } from "../sample-books"

afterEach(cleanup)

test("マスターの「設定を開く」で設定画面が開き、項目を押すと右の欄がその項目になり、閉じるで閉じる", () => {
  const store = createMatomezu({ home: MASTER.id, books: SAMPLE_BOOKS, lang: "ja", plugins: BUILTIN_UI })
  store.actions.openBook("s1", MASTER_BOOK.id)
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "設定を開く" }))
  const dialog = screen.getByRole("dialog", { name: "設定" })
  const tab = (name: string) => screen.getByRole("tab", { name })
  expect(tab("全体").getAttribute("aria-selected")).toBe("true")
  expect(screen.getByRole("tabpanel", { name: "全体" })).toBeTruthy()
  fireEvent.click(tab("ショートカットキー"))
  expect(tab("ショートカットキー").getAttribute("aria-selected")).toBe("true")
  expect(tab("全体").getAttribute("aria-selected")).toBe("false")
  expect(screen.getByRole("tabpanel", { name: "ショートカットキー" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
  expect(dialog.isConnected).toBe(false)
})

// マスターから設定画面を開き、ショートカットキーの欄にする
function openKeys() {
  const store = createMatomezu({ home: MASTER.id, books: SAMPLE_BOOKS, lang: "ja", plugins: BUILTIN_UI })
  store.actions.openBook("s1", MASTER_BOOK.id)
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "設定を開く" }))
  fireEvent.click(screen.getByRole("tab", { name: "ショートカットキー" }))
  const keys = () => store.state.getState().settings["@matomezu/base:keys"] as { added: unknown[]; removed: unknown[] }
  const dialog = within(screen.getByRole("dialog", { name: "設定" }))
  // ステージの範囲の見出しの中
  const stageScope = () => within(dialog.getByRole("region", { name: "ステージ" }))
  return { store, keys, dialog, stageScope }
}

test("ショートカットキーの欄は、範囲の見出しごとに行を並べ、探す文字で行の題名・範囲・キーの名前を絞る", () => {
  const { dialog, stageScope } = openKeys()
  expect(dialog.getByRole("region", { name: "ツリー" })).toBeTruthy()
  // args で分かれる行は、キーバインドの題名で出す
  expect(dialog.getByText("選ぶ節を上へ")).toBeTruthy()
  fireEvent.change(screen.getByRole("searchbox", { name: "ショートカットキーを探す" }), { target: { value: "元に戻" } })
  expect(stageScope().getByText("元に戻す")).toBeTruthy()
  expect(dialog.queryByRole("region", { name: "ツリー" })).toBeNull()
  fireEvent.change(screen.getByRole("searchbox", { name: "ショートカットキーを探す" }), { target: { value: "zzz" } })
  expect(screen.getByText("当てはまるショートカットキーはありません")).toBeTruthy()
})

test("+ で押したキーを覚えて足し、× で外し、既定に戻す。覚えている間の Esc はダイアログを閉じずに押したキーになる", () => {
  const { keys, stageScope } = openKeys()
  fireEvent.change(screen.getByRole("searchbox", { name: "ショートカットキーを探す" }), {
    target: { value: "元に戻す" },
  })
  fireEvent.click(stageScope().getByRole("button", { name: "「元に戻す」にキーを足す" }))
  // Esc はステージで使われているので確かめに入る（ダイアログは閉じない）。やめてから F9 を足す
  fireEvent.keyDown(stageScope().getByRole("button", { name: "「元に戻す」に足すキーを押す" }), { key: "Escape" })
  expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy()
  expect(stageScope().getByText(/は「.+」で使っています/)).toBeTruthy()
  fireEvent.click(stageScope().getByRole("button", { name: "キャンセル" }))
  fireEvent.click(stageScope().getByRole("button", { name: "「元に戻す」にキーを足す" }))
  fireEvent.keyDown(stageScope().getByRole("button", { name: "「元に戻す」に足すキーを押す" }), { key: "F9" })
  expect(keys().added).toEqual([{ key: "F9", command: "@matomezu/base:undo", scope: "stage" }])
  // 既定のキーを外すと外した行に入り、既定に戻すと変更が消える
  fireEvent.click(stageScope().getByRole("button", { name: "「元に戻す」から Ctrl+Z を外す" }))
  expect(keys().removed).toEqual([{ key: "Mod+Z", command: "@matomezu/base:undo", scope: "stage" }])
  fireEvent.click(stageScope().getByRole("button", { name: "既定に戻す" }))
  expect(keys()).toEqual({ added: [], removed: [] })
})

test("同じ範囲のほかの行が使うキーは、付ける前に確かめ、付けると向こうの行に効いていないと出る", () => {
  const { keys, stageScope } = openKeys()
  fireEvent.change(screen.getByRole("searchbox", { name: "ショートカットキーを探す" }), {
    target: { value: "元に戻す" },
  })
  fireEvent.click(stageScope().getByRole("button", { name: "「元に戻す」にキーを足す" }))
  fireEvent.keyDown(stageScope().getByRole("button", { name: "「元に戻す」に足すキーを押す" }), { key: "Home" })
  expect(stageScope().getByText(/Home は「.+」で使っています/)).toBeTruthy()
  expect(keys()).toBeUndefined()
  fireEvent.click(stageScope().getByRole("button", { name: "付ける" }))
  expect(keys().added).toEqual([{ key: "Home", command: "@matomezu/base:undo", scope: "stage" }])
  fireEvent.change(screen.getByRole("searchbox", { name: "ショートカットキーを探す" }), { target: { value: "Home" } })
  expect(stageScope().getByText(/Home は効いていません（「元に戻す」が先に使っています）/)).toBeTruthy()
})
