// プラグインフレーム: タスクボードが開くスロット（@matomezu/taskboard:plugin-frames）に追加プラグインが置いたウィジェットが、プロジェクトのレーンの右に並ぶ（そのボードのプロジェクトの id を受け取る）。
// 設定の「プラグイン」の項は、足した追加プラグインの一覧とスイッチを出し、無効にしたプラグインの物は画面の UI マッピングに置かない
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { userSetting } from "../../web/src/core/settings"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { defineWidget, placeAdded } from "../../web/src/ui/layout"
import { definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { WindowRoot } from "../../web/src/ui/WindowRoot"

afterEach(cleanup)

const kit = pluginKit("@ex/frame", defineMessages({}))
const FRAME = defineWidget({
  id: kit.name("frame"),
  slots: ["@matomezu/taskboard:plugin-frames"],
  place: "@matomezu/taskboard:plugin-frames",
  view: ({ project }) => <div data-ex-frame={project}>frame</div>,
})
const EX = definePluginUi(kit.plugin({}), { widgets: [FRAME] })

function renderBoard(disabled?: ReadonlySet<string>) {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: [...BUILTIN_UI, EX],
  })
  const project = store.actions.perform("@matomezu/taskboard:project-add", {})
  const id = project.ok ? (project.result as { project: string }).project : ""
  render(
    <MatomezuProvider instance={store} layout={placeAdded(DEFAULT_LAYOUT, store.plugins)} disabled={disabled}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  return { store, project: id }
}

test("プラグインフレームのスロットに置いたウィジェットが、そのボードのプロジェクトの id を受け取って並ぶ", () => {
  const { project } = renderBoard()
  const frame = document.querySelector("[data-ex-frame]")
  expect(frame?.getAttribute("data-ex-frame")).toBe(project)
  expect(project).not.toBe("")
})

test("無効にしたプラグインのウィジェットは置かない（プラグインは組み込んだまま）", () => {
  renderBoard(new Set(["@ex/frame"]))
  expect(document.querySelector("[data-ex-frame]")).toBeNull()
})

test("設定の「プラグイン」に、足した追加プラグインがスイッチ付きで並び、切ると無効の設定に残る（ビルトインプラグインは並べない）", () => {
  const { store } = renderBoard()
  fireEvent.click(screen.getByRole("button", { name: "設定を開く", hidden: true }))
  fireEvent.click(screen.getByRole("tab", { name: "プラグイン" }))
  const panel = screen.getByRole("tabpanel", { name: "プラグイン" })
  const boxes = within(panel).getAllByRole("checkbox") as HTMLInputElement[]
  expect(boxes.map(b => b.closest("label")?.textContent)).toEqual(["@ex/frame"])
  expect(boxes[0]?.checked).toBe(true)
  const disabled = () =>
    userSetting(store.catalog.core, store.state.getState().settings, "@matomezu/base:disabled-plugins")
  expect(disabled()).toEqual([])
  fireEvent.click(boxes[0] as HTMLInputElement)
  expect(disabled()).toEqual(["@ex/frame"])
  fireEvent.click(boxes[0] as HTMLInputElement)
  expect(disabled()).toEqual([])
})
