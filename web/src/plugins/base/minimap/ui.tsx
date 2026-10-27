// ミニマップの見た目: ステージの左下のミニマップのウィジェットと、開閉のコマンドのアイコン
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_BODY } from "../workspace/slots"
import { CornerMinimap } from "./CornerMinimap"
import { MINIMAP_ICONS } from "./icons"

export const MINIMAP_WIDGET = defineWidget({ id: kit.name("minimap"), slots: [STAGE_BODY], view: CornerMinimap })

export { MINIMAP_ICONS }
