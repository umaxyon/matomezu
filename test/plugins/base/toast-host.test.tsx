// トースト（base の toast-host。スロット root のウィジェット）: 画面の下に出て押すと消える・原因は 2 行目
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { TOAST_HOST } from "../../../web/src/plugins/base/toast-host/ui"
import { renderScreen } from "../../ui/support"

afterEach(cleanup)

test("トーストは画面の下に出て、押すと消える", () => {
  const store = renderScreen()
  expect(TOAST_HOST.slots).toEqual(["root"])
  act(() => {
    store.actions.showToast({ kind: "warn", message: "@matomezu/base:Could not undo" })
  })
  const toast = screen.getByRole("alert")
  expect(toast.textContent).toBe("元に戻せません")
  expect(toast.dataset.kind).toBe("warn")
  fireEvent.click(toast)
  expect(screen.queryByRole("alert")).toBeNull()
})

test("トーストの原因（detail）は 2 行目に出す", () => {
  const store = renderScreen()
  act(() => {
    store.actions.showToast({
      kind: "warn",
      message: "@matomezu/base:Could not undo",
      detail: {
        message: '@matomezu/base:{reason}: "{name}"',
        params: { name: "設計メモ", reason: { message: "@matomezu/base:Locked" } },
      },
    })
  })
  const toast = screen.getByRole("alert")
  expect(toast.firstChild?.textContent).toBe("元に戻せません")
  expect(toast.lastElementChild?.textContent).toBe("「設計メモ」がロック中")
})
