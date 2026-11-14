// プラグインフレーム: タスクボードが作るスロット（@matomezu/taskboard:plugin-frames）に追加プラグインが置いたウィジェットが、プロジェクトのレーンの右に並ぶ（そのボードのプロジェクトの id を受け取る）。
// 利用者が無効にしたプラグインのウィジェットは置かない（組み込んだまま）
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { defineMessages } from "../../../web/src/core/i18n/messages"
import { ENABLED_PLUGINS } from "../../../web/src/plugins/base/settings/enabled-plugins"
import { PLUGIN_FRAMES } from "../../../web/src/plugins/taskboard/board/slots"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { pluginKit } from "../../../web/src/store/kit"
import { defineWidget, placeAdded } from "../../../web/src/ui/layout"
import { definePluginUi } from "../../../web/src/ui/plugin"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { WindowRoot } from "../../../web/src/ui/WindowRoot"

afterEach(cleanup)

const kit = pluginKit("@ex/frame", defineMessages({}))
const FRAME = defineWidget({
  id: kit.name("frame"),
  slots: [PLUGIN_FRAMES],
  place: PLUGIN_FRAMES,
  view: ({ project }) => <div data-ex-frame={project}>frame</div>,
})
const EX = definePluginUi(kit.plugin({}), { widgets: [FRAME] })

function renderBoard(enabled: readonly string[]) {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: [...BUILTIN_UI, EX],
    settings: { "@matomezu/base:enabled-plugins": enabled },
  })
  const added = store.actions.perform("@matomezu/taskboard:project-add", {})
  render(
    <MatomezuProvider instance={store} layout={placeAdded(DEFAULT_LAYOUT, store.plugins)} optInAdded>
      <WindowRoot />
    </MatomezuProvider>,
  )
  return { store, project: added.ok ? (added.result as { project: string }).project : "" }
}

test("プラグインフレームのスロットに置いたウィジェットが、そのボードのプロジェクトの id を受け取って並ぶ", () => {
  const { project } = renderBoard(["@ex/frame"])
  expect(project).not.toBe("")
  expect(document.querySelector("[data-ex-frame]")?.getAttribute("data-ex-frame")).toBe(project)
})

test("足したときは無効で枠は出ず、スイッチを入れると出て、切ると消える（動いている間。プラグインは組み込んだまま）", () => {
  const { store } = renderBoard([])
  expect(document.querySelector("[data-ex-frame]")).toBeNull()
  act(() => {
    store.actions.perform("@matomezu/base:settings-set", { values: { [ENABLED_PLUGINS.id]: ["@ex/frame"] } })
  })
  expect(document.querySelector("[data-ex-frame]")).not.toBeNull()
  act(() => {
    store.actions.perform("@matomezu/base:settings-set", { values: { [ENABLED_PLUGINS.id]: [] } })
  })
  expect(document.querySelector("[data-ex-frame]")).toBeNull()
})
