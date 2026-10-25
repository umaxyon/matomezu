// 追加プラグインのブックのタイプの見本の見た目を結ぶ: ひし形のビュー・ダイアログ・流れの向きのコンポーネント。紙の見せ方はビルトインプラグインのものを使う
import { definePluginUi } from "matomezu/ui"
import { HOGE_FLOW } from "."
import { AddDiamondDialog, DIAMOND_ICON, DiamondView, DirectionSetting, EditDiamondDialog } from "./views"

export const HOGE_FLOW_UI = definePluginUi(HOGE_FLOW, {
  items: { "hoge-flow/diamond": { view: DiamondView, icon: DIAMOND_ICON } },
  settingViews: { "hoge-flow/flow.direction": { control: DirectionSetting } },
  dialogViews: { "hoge-flow/diamond.add": AddDiamondDialog, "hoge-flow/diamond.edit": EditDiamondDialog },
})

// ホストが動的に取り込むときは、default で出した見た目を結んだプラグインを受け取る
export default HOGE_FLOW_UI
