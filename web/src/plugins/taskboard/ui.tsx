// タスクボードのプラグインの見た目: チケットスクリーン（コントロールセンターの画面に重ねるスクリーン）
import { definePluginUi } from "../../plugin-api/ui"
import { TASKBOARD_PLUGIN } from "."
import { TICKET_SCREEN } from "./ticket-screen"

export const TASKBOARD_UI = definePluginUi(TASKBOARD_PLUGIN, { widgets: [TICKET_SCREEN] })

declare module "../../core/catalog" {
  interface WidgetTable {
    "@matomezu/taskboard:ticket-screen": typeof TICKET_SCREEN
  }
}
