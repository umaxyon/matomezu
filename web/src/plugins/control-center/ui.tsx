// コントロールセンターのプラグインの見た目: 窓がコントロールセンターを前に出したときの画面と、退室の確認のダイアログ。
// 画面は郵便箱と横断検索の左サイドパネルを開くので、そのタブの中身が開けるスロットを opens に書く。書庫の画面（LibraryView）が開く右クリックのメニューは contextMenus に書く
import { definePluginUi, defineWidget } from "../../plugin-api/ui"
import { LIBRARY_CONTEXT_MENUS, MAILBOX_OPENS, WIDE_SEARCH_OPENS } from "../base/ui"
import { CONTROL_CENTER_PLUGIN } from "."
import { CONTROL_CENTER_SCREEN, WORKROOM_LEAVE_DIALOG } from "./control-center"
import { kit } from "./kit"
import { ControlCenterScreen } from "./Screen"
import { PROJECTS, SIDE, WORKROOM_COLUMNS, WORKROOM_ROW_LINE } from "./slots"
import { WorkroomLeaveDialog } from "./WorkroomLeaveDialog"

export const CONTROL_CENTER_SCREEN_WIDGET = defineWidget({
  id: kit.name("screen"),
  slots: [CONTROL_CENTER_SCREEN.id],
  opens: [...MAILBOX_OPENS, ...WIDE_SEARCH_OPENS, SIDE, PROJECTS, WORKROOM_COLUMNS, WORKROOM_ROW_LINE],
  contextMenus: [...LIBRARY_CONTEXT_MENUS],
  view: ControlCenterScreen,
})

export const CONTROL_CENTER_UI = definePluginUi(CONTROL_CENTER_PLUGIN, {
  widgets: [CONTROL_CENTER_SCREEN_WIDGET],
  dialogViews: { [WORKROOM_LEAVE_DIALOG.id]: WorkroomLeaveDialog },
})

declare module "../../core/catalog" {
  interface SlotTable {
    "@matomezu/control-center:side": Record<string, never> // 左の列の、利用者パネルと参加者の一覧の間（何も受け取らない）
    "@matomezu/control-center:projects": Record<string, never> // プロジェクトの画面の上の領域（何も受け取らない）
    "@matomezu/control-center:workroom-columns": { workroom: string } // ワークルームの枠の、情報の列の右に並べる列（選んでいるワークルームの id を受け取る）
    "@matomezu/control-center:workroom-row-line": { workroom: string; admin: boolean } // 参加者の一覧の、参加済みの行の下の 1 行（その行のワークルームの id と、管理者かを受け取る）
  }
  interface WidgetTable {
    "@matomezu/control-center:screen": typeof CONTROL_CENTER_SCREEN_WIDGET
  }
}
