// コントロールセンターのプラグインの見た目: 窓がコントロールセンターを前に出したときの画面と、退室の確認のダイアログ。
// 画面は郵便箱の左サイドパネルを開くので、郵便箱のタブの中身が開けるスロットを opens に書く
import { definePluginUi, defineWidget } from "../../plugin-api/ui"
import { CONTROL_CENTER_SCREEN, MAILBOX_OPENS } from "../base/ui"
import { CONTROL_CENTER_PLUGIN } from "."
import { WORKROOM_LEAVE_DIALOG } from "./control-center"
import { kit } from "./kit"
import { ControlCenterScreen } from "./Screen"
import { WorkroomLeaveDialog } from "./WorkroomLeaveDialog"

export const CONTROL_CENTER_SCREEN_WIDGET = defineWidget({
  id: kit.name("screen"),
  slots: [CONTROL_CENTER_SCREEN],
  opens: MAILBOX_OPENS,
  view: ControlCenterScreen,
})

export const CONTROL_CENTER_UI = definePluginUi(CONTROL_CENTER_PLUGIN, {
  widgets: [CONTROL_CENTER_SCREEN_WIDGET],
  dialogViews: { [WORKROOM_LEAVE_DIALOG.id]: WorkroomLeaveDialog },
})

declare module "../../core/catalog" {
  interface WidgetTable {
    "@matomezu/control-center:screen": typeof CONTROL_CENTER_SCREEN_WIDGET
  }
}
