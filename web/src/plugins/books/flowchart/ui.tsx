// フローチャートのプラグインの見た目: 流れの向きの設定のコンポーネントと、自動で整列の確認のダイアログ（ブックは紙の見せ方で描くので、ブックのビューは無い）
import { definePluginUi } from "../../../plugin-api/ui"
import { FLOWCHART_PLUGIN } from "."
import { AlignDialog } from "./AlignDialog"
import { PAGE_ALIGN_DIALOG } from "./actions"
import { FLOWCHART_ENTRY_ICON } from "./entry-icon"
import { FlowDirectionSetting } from "./FlowDirectionSetting"
import { FLOW_DIRECTION, FLOWCHART } from "./flowchart"
import { FlowchartIcon } from "./type-icon"

export const FLOWCHART_UI = definePluginUi(FLOWCHART_PLUGIN, {
  pageTypeIcons: { [FLOWCHART.id]: <FlowchartIcon /> },
  enumValueIcons: { [FLOWCHART_ENTRY_ICON.id]: <FlowchartIcon /> },
  settingViews: { [FLOW_DIRECTION.id]: { control: FlowDirectionSetting } },
  dialogViews: { [PAGE_ALIGN_DIALOG.id]: AlignDialog },
})
