// ex2 の見た目を結ぶ: ひし形のビュー・ダイアログ・流れの向きのコンポーネント。紙の見せ方はビルトインプラグインのものを使う
import { definePluginUi } from "matomezu/ui"
import { EX2 } from "."
import { DIAMOND, DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG, FLOW_DIRECTION } from "./flow"
import { AddDiamondDialog, DIAMOND_ICON, DiamondView, DirectionSetting, EditDiamondDialog } from "./views"

export const EX2_UI = definePluginUi(EX2, {
  items: { [DIAMOND.id]: { view: DiamondView, icon: DIAMOND_ICON } },
  settingViews: { [FLOW_DIRECTION.id]: { control: DirectionSetting } },
  dialogViews: { [DIAMOND_ADD_DIALOG.id]: AddDiamondDialog, [DIAMOND_EDIT_DIALOG.id]: EditDiamondDialog },
})

export default EX2_UI
