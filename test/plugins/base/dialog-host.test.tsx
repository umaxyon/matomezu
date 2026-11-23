// ダイアログの置き場（dialog-host）: 開いた場所に向けて中身を描く
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { NO_STATE } from "../../../web/src/core/def/plugin-state"
import { defineMessages } from "../../../web/src/core/i18n/messages"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { DialogHost } from "../../../web/src/plugins/base/dialog-host/DialogHost"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { defineDialog } from "../../../web/src/store/dialogs"
import { pluginKit } from "../../../web/src/store/kit"
import { definePlugin } from "../../../web/src/store/plugin"
import { definePluginUi } from "../../../web/src/ui/plugin"
import { usePluginState, useSetPluginState } from "../../../web/src/ui/plugin-state-hooks"
import { MatomezuProvider } from "../../../web/src/ui/store-context"

afterEach(cleanup)

// スクリーンの範囲のプラグイン状態を、ダイアログの中から読み書きするテストのプラグイン
const kit = pluginKit("probe", defineMessages({}))
const PICKED = kit.definePluginStateOf<string>()({ id: "picked", scope: "screen" })
const SHOW = defineDialog({ id: "probe:show" })
function ShowDialog() {
  const picked = usePluginState(kit, PICKED)
  const set = useSetPluginState(kit, PICKED)
  return (
    <button type="button" onClick={() => set("b")}>
      picked {picked === NO_STATE ? "none" : picked}
    </button>
  )
}
const probe = definePluginUi(definePlugin(kit.plugin({ pluginStates: [PICKED], dialogs: [SHOW] })), {
  dialogViews: { "probe:show": ShowDialog },
})

test("ステージを持たずにスクリーンから開いたダイアログは、そのスクリーンに向き、スクリーンの範囲のプラグイン状態を読み書きする", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, probe],
    partial: true,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
  })
  render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      <DialogHost />
    </MatomezuProvider>,
  )
  const opener = instance.state.getState().window.screens[0]!.id
  act(() => instance.actions.openDialog(opener, "probe:show" as never, undefined as never))
  expect(instance.state.getState().dialog).toMatchObject({ stage: "none", screen: opener })
  fireEvent.click(screen.getByRole("button", { name: "picked none" }))
  expect(instance.state.getState().pluginValues.screens[opener]).toEqual({ "probe:picked": "b" })
  expect(screen.getByRole("button", { name: "picked b" })).toBeTruthy()
})
