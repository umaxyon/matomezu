// コントロールセンターのプラグインの見た目: 窓がコントロールセンターを前に出したときの画面
import { definePluginUi, defineWidget } from "../../plugin-api/ui"
import { CONTROL_CENTER_SCREEN } from "../base/ui"
import { CONTROL_CENTER_PLUGIN } from "."
import { kit } from "./kit"
import { ControlCenterScreen } from "./Screen"

export const CONTROL_CENTER_SCREEN_WIDGET = defineWidget({
  id: kit.name("screen"),
  slots: [CONTROL_CENTER_SCREEN],
  view: ControlCenterScreen,
})

export const CONTROL_CENTER_UI = definePluginUi(CONTROL_CENTER_PLUGIN, { widgets: [CONTROL_CENTER_SCREEN_WIDGET] })

declare module "../../core/catalog" {
  interface WidgetTable {
    "@matomezu/control-center:screen": typeof CONTROL_CENTER_SCREEN_WIDGET
  }
}
