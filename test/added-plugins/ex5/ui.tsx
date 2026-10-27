// ex5 の見た目を結ぶ: タイルのビュー
import { definePluginUi } from "matomezu/ui"
import { EX5 } from "."
import { TILES } from "./tiles"
import { TILES_ICON, TilesView } from "./views"

export const EX5_UI = definePluginUi(EX5, { items: { [TILES.id]: { view: TilesView, icon: TILES_ICON } } })

export default EX5_UI
