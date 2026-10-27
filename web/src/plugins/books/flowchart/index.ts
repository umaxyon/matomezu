// フローチャートのプラグイン: フローチャートのブックのタイプと、流れの向きの設定の項目、自動で整列するアクションとコマンドと確認のダイアログ。
// 形・箱・線・見せ方・ほかの設定の項目は、ほかのプラグインの定義を id で選ぶ（flowchart.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { FAMILY_TITLE_CHECK, PAGE_ALIGN, PAGE_ALIGN_COMMAND, PAGE_ALIGN_DIALOG } from "./actions"
import { FLOW_DIRECTION, FLOWCHART } from "./flowchart"
import { kit } from "./kit"

export const FLOWCHART_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [FLOWCHART],
    settings: [FLOW_DIRECTION],
    actions: [PAGE_ALIGN],
    commands: [PAGE_ALIGN_COMMAND],
    dialogs: [PAGE_ALIGN_DIALOG],
    checks: [FAMILY_TITLE_CHECK],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/flowchart:flowchart": typeof FLOWCHART
  }
  interface SettingTable {
    "@matomezu/flowchart:flow-direction": typeof FLOW_DIRECTION
  }
  interface ActionTable {
    "@matomezu/flowchart:page-align": typeof PAGE_ALIGN
  }
  interface CommandTable {
    "@matomezu/flowchart:page-align": typeof PAGE_ALIGN_COMMAND
  }
  interface DialogTable {
    "@matomezu/flowchart:page-align": typeof PAGE_ALIGN_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
