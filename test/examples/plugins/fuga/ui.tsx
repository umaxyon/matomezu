// fuga の見た目を結ぶ: 星のビュー・ダイアログ・方眼のコンポーネント・ステージの下の行に置くボタンのウィジェット。紙の見せ方はビルトインプラグインのものを使う
import { definePluginUi, defineWidget } from "matomezu/ui"
import { FUGA } from "."
import { AddStarDialog, EditStarDialog, GridSetting, MintButton, STAR_ICON, StarView } from "./views"

export const FUGA_MINT_BUTTON = defineWidget({
  id: "fuga/mint-button",
  slots: ["stage.top", "stage.bottom"],
  view: MintButton,
})

export const FUGA_UI = definePluginUi(FUGA, {
  items: { "fuga/star": { view: StarView, icon: STAR_ICON } },
  settingViews: { "fuga/board.grid": { control: GridSetting } },
  dialogViews: { "fuga/star.add": AddStarDialog, "fuga/star.edit": EditStarDialog },
  widgets: [FUGA_MINT_BUTTON],
})

// ホストが動的に取り込むときは、default で出した見た目を結んだプラグインを受け取る
export default FUGA_UI

declare module "matomezu/catalog" {
  interface WidgetTable {
    "fuga/mint-button": typeof FUGA_MINT_BUTTON
  }
}
