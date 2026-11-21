// ディレクトリ構成図のプラグイン: ディレクトリ構成図のページのタイプと、そのプレゼンテーション・説明の見せ方の設定の項目・ページを作るダイアログ・中身のアクションとコマンド・道具の組（鉛筆とハンド）。
// テーマと紙の色と文字の色の設定の項目とハンドの道具は、ほかのプラグインの定義を id で選ぶ（dir.ts・tools.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { FOLDER_CLOSE, FOLDER_SORT, NODE_ADD, NODE_MOVE, NODE_REMOVE, NODE_UPDATE, PATHS_ADD } from "./actions"
import {
  DIR_KEYS,
  FILE_ADD,
  FILE_ADD_BELOW,
  FOLDER_ADD,
  FOLDER_ADD_BELOW,
  FOLDER_OPEN,
  FOLDER_SORT_ASC,
  FOLDER_SORT_DESC,
  FOLDER_TOGGLE,
  NODE_DELETE,
  NODE_KIND_PICK,
  NODE_LEFT,
  NODE_RENAME,
  NODE_SELECT_MOVE,
  NODE_SELECT_ROOT,
  NODE_SETTINGS,
} from "./commands"
import { DIR, DIR_KEY_SCOPE, DIR_PRESENTATION, NEW_DIR_PAGE_DIALOG, NODE_SETTINGS_DIALOG } from "./dir"
import {
  DIR_DRAFT,
  DIR_EDIT_CANCEL,
  DIR_EDIT_COMMIT,
  DIR_EDIT_KEY_SCOPE,
  DIR_EDIT_KEYS,
  DIR_NOTE_DRAFT,
} from "./in-place"
import { kit } from "./kit"
import {
  ICON_BOOK,
  ICON_CLASS_DIAGRAM,
  ICON_DIRECTORY,
  ICON_FILE,
  ICON_FOLDER,
  ICON_HTML,
  NODE_ICON,
} from "./node-icon-enum"
import { NOTES } from "./notes"
import { DIR_TOOLS, PENCIL_TOOL } from "./tools"

export const DIR_PLUGIN = defineBuiltin(
  kit.plugin({
    pageTypes: [DIR],
    enums: [NODE_ICON],
    enumValues: [ICON_FOLDER, ICON_BOOK, ICON_FILE, ICON_DIRECTORY, ICON_CLASS_DIAGRAM, ICON_HTML],
    presentations: [DIR_PRESENTATION],
    settings: [NOTES],
    dialogs: [NEW_DIR_PAGE_DIALOG, NODE_SETTINGS_DIALOG],
    actions: [NODE_ADD, PATHS_ADD, NODE_UPDATE, NODE_REMOVE, NODE_MOVE, FOLDER_CLOSE, FOLDER_SORT],
    commands: [
      FOLDER_TOGGLE,
      NODE_SELECT_MOVE,
      NODE_LEFT,
      FOLDER_OPEN,
      NODE_SELECT_ROOT,
      NODE_RENAME,
      FOLDER_ADD,
      FILE_ADD,
      FOLDER_ADD_BELOW,
      FILE_ADD_BELOW,
      NODE_KIND_PICK,
      NODE_SETTINGS,
      FOLDER_SORT_ASC,
      FOLDER_SORT_DESC,
      NODE_DELETE,
      DIR_EDIT_COMMIT,
      DIR_EDIT_CANCEL,
    ],
    pluginStates: [DIR_DRAFT, DIR_NOTE_DRAFT],
    keys: [...DIR_KEYS, ...DIR_EDIT_KEYS],
    keyScopes: [DIR_KEY_SCOPE, DIR_EDIT_KEY_SCOPE],
    tools: [PENCIL_TOOL],
    toolSets: [DIR_TOOLS],
  }),
)

declare module "../../../core/catalog" {
  interface PageTypeTable {
    "@matomezu/dir:dir": typeof DIR
  }
  interface PresentationTable {
    "@matomezu/dir:dir": typeof DIR_PRESENTATION
  }
  interface EnumTable {
    "@matomezu/dir:node-icon": typeof NODE_ICON
  }
  interface EnumValueTable {
    "@matomezu/dir:node-icon-folder": typeof ICON_FOLDER
    "@matomezu/dir:node-icon-book": typeof ICON_BOOK
    "@matomezu/dir:node-icon-file": typeof ICON_FILE
    "@matomezu/dir:node-icon-directory": typeof ICON_DIRECTORY
    "@matomezu/dir:node-icon-class-diagram": typeof ICON_CLASS_DIAGRAM
    "@matomezu/dir:node-icon-html": typeof ICON_HTML
  }
  interface SettingTable {
    "@matomezu/dir:notes": typeof NOTES
  }
  interface ActionTable {
    "@matomezu/dir:node-add": typeof NODE_ADD
    "@matomezu/dir:paths-add": typeof PATHS_ADD
    "@matomezu/dir:node-update": typeof NODE_UPDATE
    "@matomezu/dir:node-remove": typeof NODE_REMOVE
    "@matomezu/dir:node-move": typeof NODE_MOVE
    "@matomezu/dir:folder-close": typeof FOLDER_CLOSE
    "@matomezu/dir:folder-sort": typeof FOLDER_SORT
  }
  interface CommandTable {
    "@matomezu/dir:folder-toggle": typeof FOLDER_TOGGLE
    "@matomezu/dir:node-select-move": typeof NODE_SELECT_MOVE
    "@matomezu/dir:node-close-or-parent": typeof NODE_LEFT
    "@matomezu/dir:folder-open": typeof FOLDER_OPEN
    "@matomezu/dir:node-select-root": typeof NODE_SELECT_ROOT
    "@matomezu/dir:node-rename": typeof NODE_RENAME
    "@matomezu/dir:folder-add": typeof FOLDER_ADD
    "@matomezu/dir:file-add": typeof FILE_ADD
    "@matomezu/dir:folder-add-below": typeof FOLDER_ADD_BELOW
    "@matomezu/dir:file-add-below": typeof FILE_ADD_BELOW
    "@matomezu/dir:node-kind-pick": typeof NODE_KIND_PICK
    "@matomezu/dir:node-settings": typeof NODE_SETTINGS
    "@matomezu/dir:folder-sort-asc": typeof FOLDER_SORT_ASC
    "@matomezu/dir:folder-sort-desc": typeof FOLDER_SORT_DESC
    "@matomezu/dir:node-delete": typeof NODE_DELETE
    "@matomezu/dir:node-edit-commit": typeof DIR_EDIT_COMMIT
    "@matomezu/dir:node-edit-cancel": typeof DIR_EDIT_CANCEL
  }
  interface PluginStateTable {
    "@matomezu/dir:in-place-draft": typeof DIR_DRAFT
    "@matomezu/dir:in-place-note-draft": typeof DIR_NOTE_DRAFT
  }
  interface KeyScopeTable {
    "@matomezu/dir:dir": typeof DIR_KEY_SCOPE // ディレクトリ構成図のプレゼンテーションで描いている間のキー
    "@matomezu/dir:in-place": typeof DIR_EDIT_KEY_SCOPE // 名前と説明をその場で書いている入力Formの中のキー
  }
  interface ToolTable {
    "@matomezu/dir:pencil": typeof PENCIL_TOOL
  }
  interface ToolSetTable {
    "@matomezu/dir:dir": typeof DIR_TOOLS
  }
  interface DialogTable {
    "@matomezu/dir:page-new": typeof NEW_DIR_PAGE_DIALOG
    "@matomezu/dir:node-settings": typeof NODE_SETTINGS_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
