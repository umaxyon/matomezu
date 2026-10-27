// ツリーのプラグインの見た目（ツリーのブックは紙の見せ方で描くので、結ぶビューは無い）
import { definePluginUi } from "../../../plugin-api/ui"
import { TREE_PLUGIN } from "."

export const TREE_UI = definePluginUi(TREE_PLUGIN, {})
