// 設定カテゴリ「更新」: 今の版・新しい版・確かめた時刻と［更新を確認］・自動で確かめるスイッチ。新しい版があれば、端末で打つコマンドを出す
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { UPDATE_CATEGORY } from "../../../web/src/plugins/base/update/ui"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

// 設定画面の「更新」を開く。［更新を確認］を押した数を数える
function renderUpdates() {
  let checks = 0
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: [],
    lang: "ja",
    plugins: BUILTIN_UI,
    updateHost: {
      check: async () => {
        checks++
        store.setUpdateStatus({
          state: "current",
          version: "0.3.0",
          latest: "0.3.0",
          checkedAt: "2026-11-22T03:00:00Z",
        })
      },
    },
  })
  store.setUpdateStatus({ state: "newer", version: "0.3.0", latest: "0.3.1", checkedAt: "2026-11-22T02:00:00Z" })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "更新" }))
  return { panel: () => screen.getByRole("tabpanel", { name: "更新" }), checks: () => checks }
}

test("「更新」は既定の UI マッピングの設定カテゴリの最後に並ぶ", () => {
  expect(DEFAULT_LAYOUT.slots["@matomezu/base:settings-categories"]?.at(-1)).toBe(UPDATE_CATEGORY.id)
})

test("新しい版があれば、その版と、端末で打つコマンドを出す。確かめ直して最新なら、「最新です」にしてコマンドを消す", async () => {
  const { panel, checks } = renderUpdates()
  expect(panel().textContent).toContain("0.3.1")
  expect(within(panel()).getByText("matomezu update")).toBeTruthy()
  expect(within(panel()).getByLabelText("新しい版を自動で確かめる")).toBeTruthy()
  await act(async () => fireEvent.click(within(panel()).getByRole("button", { name: "更新を確認" })))
  expect(checks()).toBe(1)
  expect(panel().textContent).toContain("最新です")
  expect(within(panel()).queryByText("matomezu update")).toBeNull()
})
