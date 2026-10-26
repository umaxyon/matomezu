// ex3 の見た目を結ぶ: 星のビュー・ダイアログ・方眼のコンポーネント・ステージの下の行に置いてほしいボタン。紙の見せ方はビルトインプラグインのものを使う
import { definePluginUi, defineWidget } from "matomezu/ui"
import { EX3 } from "."
import { kit } from "./kit"
import { AddStarDialog, EditStarDialog, GridSetting, MintButton, STAR_ICON, StarView } from "./views"

export const EX3_MINT_BUTTON = defineWidget({
  id: kit.name("mint-button"),
  slots: ["@matomezu/base:stage-top", "@matomezu/base:stage-bottom"],
  place: "@matomezu/base:stage-bottom",
  view: MintButton,
})

export const EX3_UI = definePluginUi(EX3, {
  items: { "ex3:star": { view: StarView, icon: STAR_ICON } },
  settingViews: { "ex3:board-grid": { control: GridSetting } },
  dialogViews: { "ex3:star-add": AddStarDialog, "ex3:star-edit": EditStarDialog },
  widgets: [EX3_MINT_BUTTON],
})

export default EX3_UI

declare module "matomezu/catalog" {
  interface WidgetTable {
    "ex3:mint-button": typeof EX3_MINT_BUTTON
  }
}
