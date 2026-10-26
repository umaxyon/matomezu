// ツールボックスのウィジェット: ステージのブックに置けるアイテムを並べる
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS } from "../workspace/ui"
import { ToolboxView } from "./ToolboxView"

export const TOOLBOX = defineWidget({ id: kit.name("toolbox"), slots: STAGE_SLOTS, view: ToolboxView })
