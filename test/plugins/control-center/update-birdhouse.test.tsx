// コントロールセンターの巣箱: 新しい版があれば押せる形になり、押すと設定画面の「更新」を選んで開く
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { CONTROL_CENTER } from "../../../web/src/plugins/control-center"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

test("新しい版があれば巣箱が押せる形になり、押すと設定画面の「更新」を開く", () => {
  const store = createMatomezu({ controlCenter: CONTROL_CENTER.id, books: [], lang: "ja", plugins: BUILTIN_UI })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  expect(screen.queryByRole("button", { name: "更新があります", hidden: true })).toBeNull()
  act(() => store.setUpdateStatus({ state: "newer", version: "0.3.0", latest: "0.3.1" }))
  fireEvent.click(screen.getByRole("button", { name: "更新があります", hidden: true }))
  expect(screen.getByRole("tab", { name: "更新" }).getAttribute("aria-selected")).toBe("true")
})
