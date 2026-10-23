// 図面のプラグインの見た目（図面のブックは紙の見せ方で描くので、結ぶビューは無い）
import { definePluginUi } from "../../../ui/plugin"
import { DRAWING_PLUGIN } from "."

export const DRAWING_UI = definePluginUi(DRAWING_PLUGIN, {})
