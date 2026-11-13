// コントロールセンターのプラグインの見た目: 窓がコントロールセンターを前に出したときの画面と、退室の確認のダイアログ。
// 画面は郵便箱の左サイドパネルを開くので、郵便箱のタブの中身が開けるスロットを opens に書く
import { definePluginUi, defineWidget } from "../../plugin-api/ui"
import {
  CONTROL_CENTER_PROJECTS,
  CONTROL_CENTER_SIDE,
  MAILBOX_OPENS,
  WORKROOM_COLUMNS,
  WORKROOM_ROW_LINE,
} from "../base/ui"
import { CONTROL_CENTER_PLUGIN } from "."
import { CONTROL_CENTER_SCREEN, WORKROOM_LEAVE_DIALOG } from "./control-center"
import { kit } from "./kit"
import { ControlCenterScreen } from "./Screen"
import { WorkroomLeaveDialog } from "./WorkroomLeaveDialog"

export const CONTROL_CENTER_SCREEN_WIDGET = defineWidget({
  id: kit.name("screen"),
  slots: [CONTROL_CENTER_SCREEN.id],
  opens: [...MAILBOX_OPENS, CONTROL_CENTER_SIDE, CONTROL_CENTER_PROJECTS, WORKROOM_COLUMNS, WORKROOM_ROW_LINE],
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
  interface SlotTable {
    "@matomezu/control-center:screen": Record<string, never> // コントロールセンターのスクリーンを描くウィジェットを置くスロット（何も受け取らない）
  }
}
