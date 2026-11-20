// ツリーのプラグイン: ツリーのページのタイプと、そのプレゼンテーション・伸びる向き・節の大きさ・節の形・線の形の設定の項目・ページを作るダイアログ・節の大きさと色のダイアログ・
// 節のアクションとコマンド・道具の組（編集とハンド）。
// テーマと紙の色の設定の項目とハンドの道具は、ほかのプラグインの定義を id で選ぶ（tree.ts・tools.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { NODE_ADD, NODE_MOVE, NODE_REMOVE, NODE_UPDATE } from "./actions"
import {
  NODE_ADD_CHILD,
  NODE_ADD_SIBLING,
  NODE_COLOR_EDIT,
  NODE_DELETE,
  NODE_EDIT,
  NODE_SELECT_MOVE,
  NODE_SELECT_ROOT,
  NODE_SIZE_EDIT,
  TREE_KEYS,
} from "./commands"
import { TREE_ENTRY_ICON } from "./entry-icon"
import { GROW } from "./grow"
import { TREE_DRAFT, TREE_EDIT_CANCEL, TREE_EDIT_COMMIT, TREE_EDIT_KEY_SCOPE, TREE_EDIT_KEYS } from "./in-place"
import { kit } from "./kit"
import { LINE_SHAPE } from "./line-shape"
import { NODE_SHAPE } from "./shape"
import { NODE_SIZE } from "./size"
import { type TREE_FOCUS_RELEASED_STATE, TREE_STATES } from "./states"
import { EDIT_TOOL, TREE_TOOLS } from "./tools"
import {
  NEW_TREE_PAGE_DIALOG,
  NODE_SIZE_DIALOG,
  TREE,
  TREE_KEY_SCOPE,
  TREE_PAGE_SETTINGS_DIALOG,
  TREE_PRESENTATION,
} from "./tree"

export const TREE_PLUGIN = defineBuiltin(
  kit.plugin({
    pageTypes: [TREE],
    enumValues: [TREE_ENTRY_ICON],
    pluginStates: [...TREE_STATES, TREE_DRAFT],
    presentations: [TREE_PRESENTATION],
    settings: [GROW, NODE_SIZE, NODE_SHAPE, LINE_SHAPE],
    dialogs: [NEW_TREE_PAGE_DIALOG, TREE_PAGE_SETTINGS_DIALOG, NODE_SIZE_DIALOG],
    actions: [NODE_ADD, NODE_UPDATE, NODE_REMOVE, NODE_MOVE],
    commands: [
      NODE_SELECT_MOVE,
      NODE_SELECT_ROOT,
      NODE_EDIT,
      NODE_ADD_CHILD,
      NODE_ADD_SIBLING,
      NODE_COLOR_EDIT,
      NODE_SIZE_EDIT,
      NODE_DELETE,
      TREE_EDIT_COMMIT,
      TREE_EDIT_CANCEL,
    ],
    keys: [...TREE_KEYS, ...TREE_EDIT_KEYS],
    keyScopes: [TREE_KEY_SCOPE, TREE_EDIT_KEY_SCOPE],
    tools: [EDIT_TOOL],
    toolSets: [TREE_TOOLS],
  }),
)

declare module "../../../core/catalog" {
  interface EnumValueTable {
    "@matomezu/tree:entry-icon": typeof TREE_ENTRY_ICON
  }
  interface PageTypeTable {
    "@matomezu/tree:tree": typeof TREE
  }
  interface PresentationTable {
    "@matomezu/tree:tree": typeof TREE_PRESENTATION
  }
  interface SettingTable {
    "@matomezu/tree:grow": typeof GROW
    "@matomezu/tree:node-size": typeof NODE_SIZE
    "@matomezu/tree:node-shape": typeof NODE_SHAPE
    "@matomezu/tree:line-shape": typeof LINE_SHAPE
  }
  interface ActionTable {
    "@matomezu/tree:node-add": typeof NODE_ADD
    "@matomezu/tree:node-update": typeof NODE_UPDATE
    "@matomezu/tree:node-remove": typeof NODE_REMOVE
    "@matomezu/tree:node-move": typeof NODE_MOVE
  }
  interface CommandTable {
    "@matomezu/tree:node-select-move": typeof NODE_SELECT_MOVE
    "@matomezu/tree:node-select-root": typeof NODE_SELECT_ROOT
    "@matomezu/tree:node-edit": typeof NODE_EDIT
    "@matomezu/tree:node-add-child": typeof NODE_ADD_CHILD
    "@matomezu/tree:node-add-sibling": typeof NODE_ADD_SIBLING
    "@matomezu/tree:node-delete": typeof NODE_DELETE
    "@matomezu/tree:node-size-edit": typeof NODE_SIZE_EDIT
    "@matomezu/tree:node-color-edit": typeof NODE_COLOR_EDIT
    "@matomezu/tree:node-edit-commit": typeof TREE_EDIT_COMMIT
    "@matomezu/tree:node-edit-cancel": typeof TREE_EDIT_CANCEL
  }
  interface PluginStateTable {
    "@matomezu/tree:focus-released": typeof TREE_FOCUS_RELEASED_STATE
    "@matomezu/tree:in-place-draft": typeof TREE_DRAFT
  }
  interface KeyScopeTable {
    "@matomezu/tree:tree": typeof TREE_KEY_SCOPE // ツリーのプレゼンテーションで描いている間のキー
    "@matomezu/tree:in-place": typeof TREE_EDIT_KEY_SCOPE // キャプションをその場で書いている入力Formの中のキー
  }
  interface ToolTable {
    "@matomezu/tree:edit": typeof EDIT_TOOL
  }
  interface ToolSetTable {
    "@matomezu/tree:tree": typeof TREE_TOOLS
  }
  interface DialogTable {
    "@matomezu/tree:page-new": typeof NEW_TREE_PAGE_DIALOG
    "@matomezu/tree:page-settings": typeof TREE_PAGE_SETTINGS_DIALOG
    "@matomezu/tree:node-size-edit": typeof NODE_SIZE_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
