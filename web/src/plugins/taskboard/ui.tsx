// タスクボードのプラグインの見た目（スキンなど。見た目の差し替えを持たない）
import { definePluginUi } from "../../plugin-api/ui"
import { TASKBOARD_PLUGIN } from "."

export const TASKBOARD_UI = definePluginUi(TASKBOARD_PLUGIN, {})
