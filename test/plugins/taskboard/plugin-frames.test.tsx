// プラグインフレーム: タスクボードが作るスロット（@matomezu/taskboard:plugin-frames）に追加プラグインが置いたウィジェットが、プロジェクトのレーンの右に並ぶ（そのボードのプロジェクトの id を受け取る）。
// 無効のプラグイン（名乗りと文言だけで組んだ物）は、ウィジェットを置かない
import { afterEach, expect, test } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { defineMessages } from "../../../web/src/core/i18n/messages"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { PLUGIN_FRAMES } from "../../../web/src/plugins/taskboard/board/slots"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { pluginKit } from "../../../web/src/store/kit"
import { defineWidget, placeAdded } from "../../../web/src/ui/layout"
import { definePluginUi, withoutUi } from "../../../web/src/ui/plugin"
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

function renderBoard(added: typeof EX | ReturnType<typeof withoutUi>) {
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
    plugins: [...BUILTIN_UI, added as typeof EX],
  })
  const project = store.actions.perform("@matomezu/taskboard:project-add", {})
  render(
    <MatomezuProvider instance={store} layout={placeAdded(DEFAULT_LAYOUT, store.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  return project.ok ? (project.result as { project: string }).project : ""
}

test("プラグインフレームのスロットに置いたウィジェットが、そのボードのプロジェクトの id を受け取って並ぶ", () => {
  const project = renderBoard(EX)
  expect(project).not.toBe("")
  expect(document.querySelector("[data-ex-frame]")?.getAttribute("data-ex-frame")).toBe(project)
})

test("無効のプラグイン（名乗りと文言だけで組んだ物）は、ウィジェットを置かない", () => {
  renderBoard(withoutUi(EX))
  expect(document.querySelector("[data-ex-frame]")).toBeNull()
})
