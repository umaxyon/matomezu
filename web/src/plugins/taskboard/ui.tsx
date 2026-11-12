// タスクボードのプラグインの見た目: コントロールセンターの左の列のプロジェクトの一覧、プロジェクトの画面のボード、ワークルームの枠の列、参加者の行の 1 行

import { definePluginUi, defineWidget } from "../../plugin-api/ui"
import { CONTROL_CENTER_PROJECTS, CONTROL_CENTER_SIDE, WORKROOM_COLUMNS, WORKROOM_ROW_LINE } from "../base/ui"
import { TASKBOARD_PLUGIN } from "."
import { kit } from "./kit"
import { ProjectListView } from "./ProjectListView"
import { TaskboardView } from "./TaskboardView"
import { WorkroomColumns } from "./WorkroomColumns"
import { WorkroomRowLine } from "./WorkroomRowLine"

export const PROJECT_LIST = defineWidget({
  id: kit.name("project-list"),
  slots: [CONTROL_CENTER_SIDE],
  view: ProjectListView,
})
export const TASKBOARD = defineWidget({
  id: kit.name("taskboard"),
  slots: [CONTROL_CENTER_PROJECTS],
  view: TaskboardView,
})
export const WORKROOM_TASK_COLUMNS = defineWidget({
  id: kit.name("workroom-columns"),
  slots: [WORKROOM_COLUMNS],
  view: WorkroomColumns,
})
export const WORKROOM_CURRENT_LINE = defineWidget({
  id: kit.name("workroom-current-line"),
  slots: [WORKROOM_ROW_LINE],
  view: WorkroomRowLine,
})

export const TASKBOARD_UI = definePluginUi(TASKBOARD_PLUGIN, {
  widgets: [PROJECT_LIST, TASKBOARD, WORKROOM_TASK_COLUMNS, WORKROOM_CURRENT_LINE],
})

declare module "../../core/catalog" {
  interface WidgetTable {
    "@matomezu/taskboard:project-list": typeof PROJECT_LIST
    "@matomezu/taskboard:taskboard": typeof TASKBOARD
    "@matomezu/taskboard:workroom-columns": typeof WORKROOM_TASK_COLUMNS
    "@matomezu/taskboard:workroom-current-line": typeof WORKROOM_CURRENT_LINE
  }
}
