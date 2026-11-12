// タスクボードのプラグインの見た目: 今は無い（ボードとチケットスクリーンはコントロールセンターが作る）
import { definePluginUi } from "../../plugin-api/ui"
import { TASKBOARD_PLUGIN } from "."

export const TASKBOARD_UI = definePluginUi(TASKBOARD_PLUGIN, {})
