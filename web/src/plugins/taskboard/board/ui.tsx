// タスクボードのウィジェット: プロジェクトの画面のタスクボード
import { defineWidget } from "../../../plugin-api/ui"
import { CONTROL_CENTER_PROJECTS } from "../../base/ui"
import { kit } from "../kit"
import { TaskboardView } from "./TaskboardView"

export const TASKBOARD = defineWidget({
  id: kit.name("taskboard"),
  slots: [CONTROL_CENTER_PROJECTS],
  view: TaskboardView,
})
