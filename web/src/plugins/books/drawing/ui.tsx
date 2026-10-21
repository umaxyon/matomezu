// 図面のプラグインの見た目: 図面のビューと、箱のビューとアイコン（各フォルダの見た目を集める）
import { definePluginUi } from "../../../ui/plugin"
import { DRAWING_PLUGIN } from "."
import { BOX_UI } from "./box/ui"
import { DRAWING_VIEW } from "./view/ui"

export const DRAWING_UI = definePluginUi(DRAWING_PLUGIN, {
  bookViews: { drawing: DRAWING_VIEW },
  items: { "shape.box": BOX_UI },
})
