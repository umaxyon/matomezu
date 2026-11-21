// ワークルームごとのカレントチケットのウィジェット: ワークルームの枠の列と、参加者の行の 1 行
import { defineWidget } from "../../../plugin-api/ui"
import { WORKROOM_COLUMNS, WORKROOM_ROW_LINE } from "../control-center-ids"
import { kit } from "../kit"
import { WorkroomColumns } from "./WorkroomColumns"
import { WorkroomRowLine } from "./WorkroomRowLine"

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
