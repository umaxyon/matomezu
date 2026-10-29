// ディレクトリ構成図のプラグイン: ディレクトリ構成図のブックのタイプと、その見せ方・説明の見せ方の設定の項目・ページを作るダイアログ・中身のアクションとコマンド・道具の組（鉛筆とハンド）。
// テーマと紙の色と文字の色の設定の項目とハンドの道具は、ほかのプラグインの定義を id で選ぶ（dir.ts・tools.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { ENTRY_ADD, ENTRY_MOVE, ENTRY_REMOVE, ENTRY_UPDATE, FOLDER_CLOSE, FOLDER_SORT, PATHS_ADD } from "./actions"
import {
  DIR_KEYS,
  ENTRY_DELETE,
  ENTRY_KIND_PICK,
  ENTRY_LEFT,
  ENTRY_RENAME,
  ENTRY_SELECT_MOVE,
  ENTRY_SELECT_ROOT,
  ENTRY_SETTINGS,
  FILE_ADD,
  FILE_ADD_BELOW,
  FOLDER_ADD,
  FOLDER_ADD_BELOW,
  FOLDER_OPEN,
  FOLDER_SORT_ASC,
  FOLDER_SORT_DESC,
  FOLDER_TOGGLE,
} from "./commands"
import { DIR, DIR_PRESENTATION, ENTRY_SETTINGS_DIALOG, NEW_DIR_PAGE_DIALOG } from "./dir"
import { kit } from "./kit"
import { NOTES } from "./notes"
import { DIR_TOOLS, PENCIL_TOOL } from "./tools"

export const DIR_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [DIR],
    presentations: [DIR_PRESENTATION],
    settings: [NOTES],
    dialogs: [NEW_DIR_PAGE_DIALOG, ENTRY_SETTINGS_DIALOG],
    actions: [ENTRY_ADD, PATHS_ADD, ENTRY_UPDATE, ENTRY_REMOVE, ENTRY_MOVE, FOLDER_CLOSE, FOLDER_SORT],
    commands: [
      FOLDER_TOGGLE,
      ENTRY_SELECT_MOVE,
      ENTRY_LEFT,
      FOLDER_OPEN,
      ENTRY_SELECT_ROOT,
      ENTRY_RENAME,
      FOLDER_ADD,
      FILE_ADD,
      FOLDER_ADD_BELOW,
      FILE_ADD_BELOW,
      ENTRY_KIND_PICK,
      ENTRY_SETTINGS,
      FOLDER_SORT_ASC,
      FOLDER_SORT_DESC,
      ENTRY_DELETE,
    ],
    keys: DIR_KEYS,
    tools: [PENCIL_TOOL],
    toolSets: [DIR_TOOLS],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/dir:dir": typeof DIR
  }
  interface PresentationTable {
    "@matomezu/dir:dir": typeof DIR_PRESENTATION
  }
  interface SettingTable {
    "@matomezu/dir:notes": typeof NOTES
  }
  interface ActionTable {
    "@matomezu/dir:entry-add": typeof ENTRY_ADD
    "@matomezu/dir:paths-add": typeof PATHS_ADD
    "@matomezu/dir:entry-update": typeof ENTRY_UPDATE
    "@matomezu/dir:entry-remove": typeof ENTRY_REMOVE
    "@matomezu/dir:entry-move": typeof ENTRY_MOVE
    "@matomezu/dir:folder-close": typeof FOLDER_CLOSE
    "@matomezu/dir:folder-sort": typeof FOLDER_SORT
  }
  interface CommandTable {
    "@matomezu/dir:folder-toggle": typeof FOLDER_TOGGLE
    "@matomezu/dir:entry-select-move": typeof ENTRY_SELECT_MOVE
    "@matomezu/dir:entry-close-or-parent": typeof ENTRY_LEFT
    "@matomezu/dir:folder-open": typeof FOLDER_OPEN
    "@matomezu/dir:entry-select-root": typeof ENTRY_SELECT_ROOT
    "@matomezu/dir:entry-rename": typeof ENTRY_RENAME
    "@matomezu/dir:folder-add": typeof FOLDER_ADD
    "@matomezu/dir:file-add": typeof FILE_ADD
    "@matomezu/dir:folder-add-below": typeof FOLDER_ADD_BELOW
    "@matomezu/dir:file-add-below": typeof FILE_ADD_BELOW
    "@matomezu/dir:entry-kind-pick": typeof ENTRY_KIND_PICK
    "@matomezu/dir:entry-settings": typeof ENTRY_SETTINGS
    "@matomezu/dir:folder-sort-asc": typeof FOLDER_SORT_ASC
    "@matomezu/dir:folder-sort-desc": typeof FOLDER_SORT_DESC
    "@matomezu/dir:entry-delete": typeof ENTRY_DELETE
  }
  interface KeyScopeTable {
    "@matomezu/dir:dir": true // ディレクトリ構成図の見せ方で描いている間のキー
  }
  interface ToolTable {
    "@matomezu/dir:pencil": typeof PENCIL_TOOL
  }
  interface ToolSetTable {
    "@matomezu/dir:dir": typeof DIR_TOOLS
  }
  interface DialogTable {
    "@matomezu/dir:page-new": typeof NEW_DIR_PAGE_DIALOG
    "@matomezu/dir:entry-settings": typeof ENTRY_SETTINGS_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
