// コントロールセンターのプラグインの見た目: 画面を持たない
import { definePluginUi } from "../../plugin-api/ui"
import { CONTROL_CENTER_PLUGIN } from "."

export const CONTROL_CENTER_UI = definePluginUi(CONTROL_CENTER_PLUGIN, {})
