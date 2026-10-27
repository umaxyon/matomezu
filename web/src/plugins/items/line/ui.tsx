// 線の見た目: 形を並べるビューに重ねる線の層と形の上の〇（ui/connector.ts）、線の編集のダイアログ、線の既定の通り方の設定のコンポーネント
import { type ConnectorUi, definePluginUi } from "../../../plugin-api/ui"
import { LINE_PLUGIN } from "."
import { EditLineDialog } from "./LineDialog"
import { LineLayer, PortOverlay } from "./LineLayer"
import { LINE, LINE_EDIT_DIALOG, LINE_ROUTE } from "./line"
import { LINE_CONTEXT } from "./menu"
import { RouteSetting } from "./RouteSetting"

export const LINE_CONNECTOR_UI = {
  layer: LineLayer,
  overlay: PortOverlay,
  contextMenus: [LINE_CONTEXT],
} as const satisfies ConnectorUi

export const LINE_DIALOG_VIEWS = { [LINE_EDIT_DIALOG.id]: EditLineDialog }

export const LINE_SETTING_VIEWS = { [LINE_ROUTE.id]: { control: RouteSetting } }

export const LINE_UI = definePluginUi(LINE_PLUGIN, {
  connectors: { [LINE.id]: LINE_CONNECTOR_UI },
  settingViews: LINE_SETTING_VIEWS,
  dialogViews: LINE_DIALOG_VIEWS,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/line:line-context": { item: string } // 線（右クリックした線の id）
  }
}
