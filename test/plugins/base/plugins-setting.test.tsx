// 設定の「プラグイン」: 足した追加プラグインがスイッチ付きで並び（ビルトインプラグインは並べない）、入れると有効の設定に残り、切ると外れる
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { defineMessages } from "../../../web/src/core/i18n/messages"
import { userSetting } from "../../../web/src/core/settings"
import { type MovedIfOff, PURGED } from "../../../web/src/core/unreadable"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { ENABLED_PLUGINS } from "../../../web/src/plugins/base/settings/enabled-plugins"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { pluginKit } from "../../../web/src/store/kit"
import { placeAdded } from "../../../web/src/ui/layout"
import { definePluginUi } from "../../../web/src/ui/plugin"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

const kit = pluginKit("@ex/frame", defineMessages({}))
const EX = definePluginUi(kit.plugin({}), {})

// moved を移る物と答えるホストの口を持つ窓で、設定の「プラグイン」のタブを開く
function openPlugins(moved: readonly MovedIfOff[] = []) {
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
    plugins: [...BUILTIN_UI, EX],
    unreadableHost: { purge: async () => PURGED, movedIfOff: async () => moved },
  })
  render(
    <MatomezuProvider instance={store} layout={placeAdded(DEFAULT_LAYOUT, store.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "プラグイン" }))
  const panel = screen.getByRole("tabpanel", { name: "プラグイン" })
  const boxes = within(panel).getAllByRole("checkbox") as HTMLInputElement[]
  const enabled = () => userSetting(store.catalog.core, store.state.getState().settings, ENABLED_PLUGINS.id)
  return { store, boxes, enabled }
}

test("設定の「プラグイン」に、足した追加プラグインがスイッチ付きで並び、入れると有効の設定に残る", async () => {
  const { boxes, enabled } = openPlugins()
  expect(boxes.map(b => b.closest("label")?.textContent)).toEqual(["@ex/frame"])
  expect(boxes[0]?.checked).toBe(false) // 足したときは無効
  expect(enabled()).toEqual([])
  fireEvent.click(boxes[0] as HTMLInputElement)
  expect(enabled()).toEqual(["@ex/frame"])
  fireEvent.click(boxes[0] as HTMLInputElement)
  await waitFor(() => expect(enabled()).toEqual([])) // 移る物が無ければ、確かめずに無効にする
  expect(screen.queryByText(/件移ります/)).toBeNull()
})

test("無効にすると読めなくなる物が在れば、件数と在る所を出して確かめ、やめれば有効のまま、無効にするを押すと無効になる", async () => {
  const moved: MovedIfOff[] = [
    { id: "p1", kind: "page", holder: "b1", code: "W027", type: "@ex/frame:flow" },
    { id: "p2", kind: "page", holder: "b1", code: "W027", type: "@ex/frame:flow" },
  ]
  const { boxes, enabled } = openPlugins(moved)
  fireEvent.click(boxes[0] as HTMLInputElement)
  fireEvent.click(boxes[0] as HTMLInputElement)
  const ask = (await screen.findByText("読めない物のフォルダへ 2 件移ります")).closest("dialog") as HTMLElement
  expect(within(ask).getByText(/^「.+」 2 件$/)).toBeTruthy()
  fireEvent.click(within(ask).getByRole("button", { name: "キャンセル", hidden: true }))
  expect(enabled()).toEqual(["@ex/frame"])
  fireEvent.click(boxes[0] as HTMLInputElement)
  await screen.findByText("読めない物のフォルダへ 2 件移ります")
  fireEvent.click(screen.getByRole("button", { name: "無効にする", hidden: true }))
  expect(enabled()).toEqual([])
})
