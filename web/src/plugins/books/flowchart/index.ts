// フローチャートのプラグイン: フローチャートのブックのタイプと、流れの向きの設定の項目。
// 形・箱・線・見せ方・ほかの設定の項目は、ほかのプラグインの定義を id で選ぶ（flowchart.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { FLOW_DIRECTION, FLOWCHART } from "./flowchart"
import { kit } from "./kit"

export const FLOWCHART_PLUGIN = defineBuiltin(kit.plugin({ bookTypes: [FLOWCHART], settings: [FLOW_DIRECTION] }))

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/flowchart:flowchart": typeof FLOWCHART
  }
  interface SettingTable {
    "@matomezu/flowchart:flow-direction": typeof FLOW_DIRECTION
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
