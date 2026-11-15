// 図面のプラグインの見た目（図面のブックは紙の見せ方で描くので、結ぶビューは無い）
import { definePluginUi } from "../../../plugin-api/ui"
import { DRAWING_PLUGIN } from "."
import { DRAWING } from "./drawing"
import { DRAWING_ENTRY_ICON } from "./entry-icon"
import { DrawingIcon } from "./type-icon"

export const DRAWING_UI = definePluginUi(DRAWING_PLUGIN, {
  pageTypeIcons: { [DRAWING.id]: <DrawingIcon /> },
  enumValueIcons: { [DRAWING_ENTRY_ICON.id]: <DrawingIcon /> },
})
