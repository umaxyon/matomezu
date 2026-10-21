// 道具の切り替えのウィジェット: 今の道具を手前に見せ、押すと次の道具に回す
import { defineWidget } from "../../../ui/layout"
import { STAGE_SLOTS } from "../workspace/ui"
import { ToolSwitchView } from "./ToolSwitchView"

export const TOOL_SWITCH = defineWidget({ id: "tool-switch", slots: STAGE_SLOTS, view: ToolSwitchView })
