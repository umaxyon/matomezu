// ツリーのプラグイン: ツリーのブックのタイプと、その見せ方・伸びる向きの設定の項目・ページを作るダイアログ・道具の組（編集とハンド）。
// テーマと紙の色の設定の項目とハンドの道具は、ほかのプラグインの定義を id で選ぶ（tree.ts・tools.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { NODE_ADD, NODE_REMOVE, NODE_UPDATE } from "./actions"
import { NODE_EDIT, NODE_SELECT_MOVE, TREE_KEYS } from "./commands"
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
    actions: [NODE_ADD, NODE_UPDATE, NODE_REMOVE],
    commands: [NODE_SELECT_MOVE, NODE_EDIT],
    keys: TREE_KEYS,
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
  interface ActionTable {
    "@matomezu/tree:node-add": typeof NODE_ADD
    "@matomezu/tree:node-update": typeof NODE_UPDATE
    "@matomezu/tree:node-remove": typeof NODE_REMOVE
  }
  interface CommandTable {
    "@matomezu/tree:node-select-move": typeof NODE_SELECT_MOVE
    "@matomezu/tree:node-edit": typeof NODE_EDIT
  }
  interface KeyScopeTable {
    "@matomezu/tree:tree": true // ツリーの見せ方で描いている間のキー
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
