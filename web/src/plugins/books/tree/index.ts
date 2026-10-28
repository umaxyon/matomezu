// ツリーのプラグイン: ツリーのブックのタイプと、その見せ方・伸びる向きの設定の項目・ページを作るダイアログ・道具の組（編集とハンド）。
// テーマと紙の色の設定の項目とハンドの道具は、ほかのプラグインの定義を id で選ぶ（tree.ts・tools.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { GROW } from "./grow"
import { kit } from "./kit"
import { EDIT_TOOL, TREE_TOOLS } from "./tools"
import { NEW_TREE_PAGE_DIALOG, TREE, TREE_PRESENTATION } from "./tree"

export const TREE_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [TREE],
    presentations: [TREE_PRESENTATION],
    settings: [GROW],
    dialogs: [NEW_TREE_PAGE_DIALOG],
    tools: [EDIT_TOOL],
    toolSets: [TREE_TOOLS],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/tree:tree": typeof TREE
  }
  interface PresentationTable {
    "@matomezu/tree:tree": typeof TREE_PRESENTATION
  }
  interface SettingTable {
    "@matomezu/tree:grow": typeof GROW
  }
  interface ToolTable {
    "@matomezu/tree:edit": typeof EDIT_TOOL
  }
  interface ToolSetTable {
    "@matomezu/tree:tree": typeof TREE_TOOLS
  }
  interface DialogTable {
    "@matomezu/tree:page-new": typeof NEW_TREE_PAGE_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
