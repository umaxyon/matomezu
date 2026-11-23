// コントロールセンターの「あなた」: 設定の「ユーザー名」があればその名前、空なら「あなた」
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { CONTROL_CENTER } from "../../../web/src/plugins/control-center"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

function setUserName(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  const name = within(screen.getByRole("tabpanel", { name: "全体" })).getByLabelText("ユーザー名") as HTMLInputElement
  expect(name.placeholder).toBe("あなた")
  fireEvent.change(name, { target: { value: text } })
  fireEvent.blur(name)
  fireEvent.click(screen.getByRole("button", { name: "閉じる" }))
}

test("ユーザー名を変えると「あなた」がその名前になり、空に戻せば「あなた」", () => {
  const store = createMatomezu({ controlCenter: CONTROL_CENTER.id, books: [], lang: "ja", plugins: BUILTIN_UI })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  setUserName("まさ")
  expect(screen.getByText("まさ")).toBeTruthy()
  setUserName("")
  expect(screen.queryByText("まさ")).toBeNull()
  expect(screen.getByText("あなた")).toBeTruthy()
})
