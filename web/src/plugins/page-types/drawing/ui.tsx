// 図面のプラグインの見た目（図面のページは紙のプレゼンテーションで描くので、結ぶビューは無い）
import { definePluginUi } from "../../../plugin-api/ui"
import { DRAWING_PLUGIN } from "."
import { DRAWING } from "./drawing"
import { DRAWING_NODE_ICON } from "./node-icon"
import { DrawingIcon } from "./type-icon"

export const DRAWING_UI = definePluginUi(DRAWING_PLUGIN, {
  pageTypeIcons: { [DRAWING.id]: <DrawingIcon /> },
  enumValueIcons: { [DRAWING_NODE_ICON.id]: <DrawingIcon /> },
})
