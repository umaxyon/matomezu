// 外から足すブックのタイプの見本の見た目を結ぶ: ひし形のビュー・ダイアログ・流れの向きの部品。紙の見せ方は中の部品のものを使う
import { definePluginUi } from "matomezu/ui"
import { HOGE_FLOW } from "."
import { AddDiamondDialog, DIAMOND_ICON, DiamondView, DirectionSetting, EditDiamondDialog } from "./views"

export const HOGE_FLOW_UI = definePluginUi(HOGE_FLOW, {
  items: { "hoge-flow/diamond": { view: DiamondView, icon: DIAMOND_ICON } },
  settingViews: { "hoge-flow/flow.direction": { control: DirectionSetting } },
  dialogViews: { "hoge-flow/diamond.add": AddDiamondDialog, "hoge-flow/diamond.edit": EditDiamondDialog },
})
