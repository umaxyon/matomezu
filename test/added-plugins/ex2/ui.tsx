// ex2 の見た目を結ぶ: ひし形のビュー・ダイアログ・流れの向きのコンポーネント。紙の見せ方はビルトインプラグインのものを使う
import { definePluginUi } from "matomezu/ui"
import { EX2 } from "."
import { AddDiamondDialog, DIAMOND_ICON, DiamondView, DirectionSetting, EditDiamondDialog } from "./views"

export const EX2_UI = definePluginUi(EX2, {
  items: { "ex2/diamond": { view: DiamondView, icon: DIAMOND_ICON } },
  settingViews: { "ex2/flow.direction": { control: DirectionSetting } },
  dialogViews: { "ex2/diamond.add": AddDiamondDialog, "ex2/diamond.edit": EditDiamondDialog },
})

export default EX2_UI
