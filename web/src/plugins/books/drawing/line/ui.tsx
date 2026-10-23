// 線の見た目: 形を並べるビューに重ねる線の層と形の上の〇（ui/connector.ts）、線の編集のダイアログ、線の既定の通り方の設定の部品
import type { ConnectorUi } from "../../../../ui/connector"
import { EditLineDialog } from "./LineDialog"
import { LineLayer, PortOverlay } from "./LineLayer"
import { RouteSetting } from "./RouteSetting"

export const LINE_UI = {
  layer: LineLayer,
  overlay: PortOverlay,
  contextMenus: ["line.context"],
} as const satisfies ConnectorUi

export const LINE_DIALOG_VIEWS = { "line.edit": EditLineDialog }

export const LINE_SETTING_VIEWS = { "line.route": { control: RouteSetting } }
