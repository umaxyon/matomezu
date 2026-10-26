// フローチャートのプラグインの見た目: 流れの向きの設定のコンポーネント（ブックは紙の見せ方で描くので、ブックのビューは無い）
import { definePluginUi } from "../../../plugin-api/ui"
import { FLOWCHART_PLUGIN } from "."
import { FlowDirectionSetting } from "./FlowDirectionSetting"
import { FLOW_DIRECTION } from "./flowchart"

export const FLOWCHART_UI = definePluginUi(FLOWCHART_PLUGIN, {
  settingViews: { [FLOW_DIRECTION.id]: { control: FlowDirectionSetting } },
})
