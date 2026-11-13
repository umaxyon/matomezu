// タスクボードのプラグインの見た目: コントロールセンターの左の列のプロジェクトの一覧、プロジェクトの画面のタスクボード、ワークルームの枠の列、参加者の行の 1 行、プロジェクト設定のダイアログ

import { definePluginUi } from "../../plugin-api/ui"
import { TASKBOARD_PLUGIN } from "."
import { TASKBOARD } from "./board/ui"
import { WORKROOM_CURRENT_LINE, WORKROOM_TASK_COLUMNS } from "./current-ticket/ui"
import { PROJECT_LIST } from "./project-list/ui"
import { PROJECT_SETTINGS_DIALOG } from "./project-settings"
import { ProjectSettingsDialog } from "./project-settings/ProjectSettingsDialog"
import { TICKET_SCREEN_VIEW } from "./ticket-screen/ui"

export const TASKBOARD_UI = definePluginUi(TASKBOARD_PLUGIN, {
  widgets: [PROJECT_LIST, TASKBOARD, WORKROOM_TASK_COLUMNS, WORKROOM_CURRENT_LINE, TICKET_SCREEN_VIEW],
  dialogViews: { [PROJECT_SETTINGS_DIALOG.id]: ProjectSettingsDialog },
})

declare module "../../core/catalog" {
  interface WidgetTable {
    "@matomezu/taskboard:project-list": typeof PROJECT_LIST
    "@matomezu/taskboard:taskboard": typeof TASKBOARD
    "@matomezu/taskboard:workroom-columns": typeof WORKROOM_TASK_COLUMNS
    "@matomezu/taskboard:workroom-current-line": typeof WORKROOM_CURRENT_LINE
    "@matomezu/taskboard:ticket-screen-view": typeof TICKET_SCREEN_VIEW
  }
}
