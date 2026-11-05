// 設定画面: マスターのボタンから設定画面のダイアログを開き、左の項目（全体・ショートカットキー）を押すと右の欄が切り替わる
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
