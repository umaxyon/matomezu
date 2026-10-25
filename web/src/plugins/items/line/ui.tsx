// 線の見た目: 形を並べるビューに重ねる線の層と形の上の〇（ui/connector.ts）、線の編集のダイアログ、線の既定の通り方の設定のコンポーネント
import type { ConnectorUi } from "../../../ui/connector"
import { definePluginUi } from "../../../ui/plugin"
import { LINE_PLUGIN } from "."
import { EditLineDialog } from "./LineDialog"
import { LineLayer, PortOverlay } from "./LineLayer"
import { RouteSetting } from "./RouteSetting"

export const LINE_CONNECTOR_UI = {
  layer: LineLayer,
  overlay: PortOverlay,
  contextMenus: ["line.context"],
} as const satisfies ConnectorUi

export const LINE_DIALOG_VIEWS = { "line.edit": EditLineDialog }

export const LINE_SETTING_VIEWS = { "line.route": { control: RouteSetting } }

export const LINE_UI = definePluginUi(LINE_PLUGIN, {
  connectors: { "connector.line": LINE_CONNECTOR_UI },
  settingViews: LINE_SETTING_VIEWS,
  dialogViews: LINE_DIALOG_VIEWS,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "line.context": { item: string } // 線（右クリックした線の id）
  }
}
