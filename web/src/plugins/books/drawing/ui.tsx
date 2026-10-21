// 図面のプラグインの見た目: 図面のビューと、箱のビューとアイコン
import { definePluginUi } from "../../../ui/plugin"
import { DRAWING_PLUGIN } from "."
import { BoxView } from "./BoxView"
import { DrawingView } from "./DrawingView"
import { BOX_ICON } from "./icons"

export const DRAWING_UI = definePluginUi(DRAWING_PLUGIN, {
  bookViews: { drawing: DrawingView },
  items: { "shape.box": { view: BoxView, icon: BOX_ICON } },
})
