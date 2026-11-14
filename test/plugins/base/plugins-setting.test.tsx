// 設定の「プラグイン」: 足した追加プラグインがスイッチ付きで並び（ビルトインプラグインは並べない）、切ると無効の設定に残り、入れると外れる
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { defineMessages } from "../../../web/src/core/i18n/messages"
import { userSetting } from "../../../web/src/core/settings"
import { DISABLED_PLUGINS } from "../../../web/src/plugins/base/settings/disabled-plugins"
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

test("設定の「プラグイン」に、足した追加プラグインがスイッチ付きで並び、切ると無効の設定に残る", () => {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: [...BUILTIN_UI, EX],
  })
  render(
    <MatomezuProvider instance={store} layout={placeAdded(DEFAULT_LAYOUT, store.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "設定を開く", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "プラグイン" }))
  const panel = screen.getByRole("tabpanel", { name: "プラグイン" })
  const boxes = within(panel).getAllByRole("checkbox") as HTMLInputElement[]
  expect(boxes.map(b => b.closest("label")?.textContent)).toEqual(["@ex/frame"])
  expect(boxes[0]?.checked).toBe(true)
  const disabled = () => userSetting(store.catalog.core, store.state.getState().settings, DISABLED_PLUGINS.id)
  expect(disabled()).toEqual([])
  fireEvent.click(boxes[0] as HTMLInputElement)
  expect(disabled()).toEqual(["@ex/frame"])
  fireEvent.click(boxes[0] as HTMLInputElement)
  expect(disabled()).toEqual([])
})
