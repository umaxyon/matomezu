// ex5 の見た目を結ぶ: タイルのビューと、仕分けの道具のアイコン
import { definePluginUi } from "matomezu/ui"
import { EX5 } from "."
import { SORT_TOOL, TILES } from "./tiles"
import { SORT_ICON, TILES_ICON, TilesView } from "./views"

export const EX5_UI = definePluginUi(EX5, {
  items: { [TILES.id]: { view: TilesView, icon: TILES_ICON } },
  toolIcons: { [SORT_TOOL.id]: SORT_ICON },
})

export default EX5_UI
