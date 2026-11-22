// 古い版の画面のダイアログ: 版の違いと送らずに捨てた操作の数を出し、Escape でも閉じず、ボタンで読み込み直す
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { STALE_BUILD } from "../../../web/src/plugins/base/update/ui"
import { BUILTIN_UI } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { defineLayout } from "../../../web/src/ui/layout"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

const LAYOUT = defineLayout({ id: "t", slots: { root: [STALE_BUILD.id] }, menus: {} })

test("つなぎ直した常駐が別の版なら、版の違いと捨てた操作の数を出し、Escape でも閉じず、ボタンで読み込み直す", () => {
  let reloaded = 0
  const instance = createMatomezu({ plugins: BUILTIN_UI, lang: "ja", reloadWindow: () => reloaded++ })
  render(
    <MatomezuProvider instance={instance} layout={LAYOUT} warnings={[]}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  expect(screen.queryByRole("alertdialog")).toBeNull()
  act(() =>
    instance.setStaleBuild({
      from: { version: "0.3.0", dataVersion: 7 },
      to: { version: "0.3.1", dataVersion: 8 },
      dropped: 2,
    }),
  )
  const dialog = screen.getByRole("alertdialog", { name: "matomezu が更新されました" })
  expect(dialog.textContent).toContain("0.3.0 → 0.3.1")
  expect(dialog.textContent).toContain("届いていない操作が 2 件あり、読み込み直すと消えます")
  fireEvent.keyDown(dialog, { key: "Escape" })
  expect(screen.getByRole("alertdialog")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "画面を読み込み直す" }))
  expect(reloaded).toBe(1)
})
