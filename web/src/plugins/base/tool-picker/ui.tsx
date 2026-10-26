// 道具のアイコンのウィジェット: 根に置き、右ボタンの長押しを見て、開いた道具のアイコンを描く
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { ToolPickerView } from "./ToolPickerView"

export const TOOL_PICKER_WIDGET = defineWidget({ id: kit.name("tool-picker"), slots: ["root"], view: ToolPickerView })
