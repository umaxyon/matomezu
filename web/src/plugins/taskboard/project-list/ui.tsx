// プロジェクトの一覧のウィジェット: コントロールセンターの左の列
import { defineWidget } from "../../../plugin-api/ui"
import { CONTROL_CENTER_SIDE } from "../control-center-ids"
import { kit } from "../kit"
import { ProjectListView } from "./ProjectListView"

export const PROJECT_LIST = defineWidget({
  id: kit.name("project-list"),
  slots: [CONTROL_CENTER_SIDE],
  view: ProjectListView,
})
