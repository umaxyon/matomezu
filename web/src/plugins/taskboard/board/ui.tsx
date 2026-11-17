// タスクボードのウィジェット: プロジェクトの画面のタスクボード
import { defineWidget } from "../../../plugin-api/ui"
import { CONTROL_CENTER_PROJECTS } from "../control-center-ids"
import { kit } from "../kit"
import { PLUGIN_FRAMES } from "./slots"
import { TaskboardView } from "./TaskboardView"

export const TASKBOARD = defineWidget({
  id: kit.name("taskboard"),
  slots: [CONTROL_CENTER_PROJECTS],
  opens: [PLUGIN_FRAMES],
  view: TaskboardView,
})
