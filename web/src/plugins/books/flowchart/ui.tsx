// フローチャートのプラグインの見た目: 流れの向きの設定のコンポーネントと、自動で整列の確認のダイアログ（ブックは紙の見せ方で描くので、ブックのビューは無い）
import { definePluginUi } from "../../../plugin-api/ui"
import { FLOWCHART_PLUGIN } from "."
import { AlignDialog } from "./AlignDialog"
import { PAGE_ALIGN_DIALOG } from "./actions"
import { FlowDirectionSetting } from "./FlowDirectionSetting"
import { FLOW_DIRECTION } from "./flowchart"

export const FLOWCHART_UI = definePluginUi(FLOWCHART_PLUGIN, {
  settingViews: { [FLOW_DIRECTION.id]: { control: FlowDirectionSetting } },
  dialogViews: { [PAGE_ALIGN_DIALOG.id]: AlignDialog },
})
