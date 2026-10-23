// 土台のプラグイン: ステージ（ホームを開く・分割・閉じる）・道具の切り替え（回転ボタンと、長押しで出すアイコン）・置くのの取り消し・ダイアログと右クリックのメニューを閉じる・ブックを開く・ページ・紙・設定・標準のテーマ・スキン（ダーク・ライト）と、そのキーの既定の割り当て。
// 機能ごとのフォルダの定義を集めて 1 つのプラグインにする。画面の骨組みのウィジェット（ui.tsx）がここのコマンドを呼ぶ
import { defineBuiltin } from "../../store/plugin"
import { BOOK_SETTINGS, BOOK_SETTINGS_DIALOG, BOOK_UPDATE } from "./book-look"
import { BOOK_OPEN, OPEN_BOOK_DIALOG } from "./book-open"
import { MENU_CLOSE, MENU_KEYS } from "./context-menu"
import { DIALOG_CLOSE, DIALOG_KEYS, DIALOG_SUBMIT } from "./dialog-host"
import { DARK, LIGHT, PAPERS, STANDARD } from "./looks"
import type { A3, A4, A5 } from "./looks/papers"
import { BASE_MESSAGES } from "./messages"
import { NEW_PAGE_DIALOG, PAGE_ADD, PAGE_NEW, PAGE_OPEN, PAGE_SETTINGS, PAGE_SETTINGS_DIALOG } from "./page-tabs"
import { PAGE_UPDATE } from "./page-tabs/page-update"
import { SET_KEYS, SET_LANG, SET_SKIN, SETTINGS_LANG, SETTINGS_SKIN } from "./settings"
import { STAGE_CLOSE, STAGE_HOME, STAGE_SPLIT, STAGE_UNSPLIT } from "./stage"
import { TOOL_PICKER, TOOL_PICKER_KEYS, TOOL_SET } from "./tool-picker"
import { TOOL_NEXT } from "./tool-switch"
import { TOOLBOX_CANCEL, TOOLBOX_KEYS } from "./toolbox"

export { PAPER_IDS, PAPERS } from "./looks"
export { NEW_PAGE_DIALOG, OPEN_BOOK_DIALOG }

export const BASE = defineBuiltin({
  id: "@matomezu/base",
  actions: [PAGE_ADD, PAGE_UPDATE, BOOK_UPDATE, SET_LANG, SET_SKIN, SET_KEYS],
  themes: [STANDARD],
  papers: PAPERS,
  skins: [DARK, LIGHT],
  commands: [
    STAGE_HOME,
    STAGE_SPLIT,
    STAGE_UNSPLIT,
    STAGE_CLOSE,
    TOOL_NEXT,
    TOOL_SET,
    TOOL_PICKER,
    TOOLBOX_CANCEL,
    DIALOG_SUBMIT,
    DIALOG_CLOSE,
    MENU_CLOSE,
    BOOK_OPEN,
    PAGE_NEW,
    PAGE_OPEN,
    PAGE_SETTINGS,
    BOOK_SETTINGS,
    SETTINGS_LANG,
    SETTINGS_SKIN,
  ],
  dialogs: [OPEN_BOOK_DIALOG, NEW_PAGE_DIALOG, PAGE_SETTINGS_DIALOG, BOOK_SETTINGS_DIALOG],
  keys: [...TOOLBOX_KEYS, ...TOOL_PICKER_KEYS, ...DIALOG_KEYS, ...MENU_KEYS],
  messages: BASE_MESSAGES,
})

declare module "../../core/tables" {
  interface MessageTable extends Readonly<typeof BASE_MESSAGES> {}
  interface ActionTable {
    "page.add": typeof PAGE_ADD
    "book.update": typeof BOOK_UPDATE
    "page.update": typeof PAGE_UPDATE
    "settings.lang": typeof SET_LANG
    "settings.skin": typeof SET_SKIN
    "settings.keys": typeof SET_KEYS
  }
  interface ThemeTable {
    standard: typeof STANDARD
  }
  interface SkinTable {
    dark: typeof DARK
    light: typeof LIGHT
  }
  interface PaperTable {
    a5: typeof A5
    a4: typeof A4
    a3: typeof A3
  }
}

declare module "../../store/tables" {
  interface CommandTable {
    "stage.home": typeof STAGE_HOME
    "stage.split": typeof STAGE_SPLIT
    "stage.unsplit": typeof STAGE_UNSPLIT
    "stage.close": typeof STAGE_CLOSE
    "tool.next": typeof TOOL_NEXT
    "tool.set": typeof TOOL_SET
    "tool.picker": typeof TOOL_PICKER
    "toolbox.cancel": typeof TOOLBOX_CANCEL
    "dialog.submit": typeof DIALOG_SUBMIT
    "dialog.close": typeof DIALOG_CLOSE
    "menu.close": typeof MENU_CLOSE
    "book.open": typeof BOOK_OPEN
    "page.new": typeof PAGE_NEW
    "page.open": typeof PAGE_OPEN
    "page.settings": typeof PAGE_SETTINGS
    "book.settings": typeof BOOK_SETTINGS
    "settings.lang": typeof SETTINGS_LANG
    "settings.skin": typeof SETTINGS_SKIN
  }
  interface DialogTable {
    "book.open": typeof OPEN_BOOK_DIALOG
    "page.new": typeof NEW_PAGE_DIALOG
    "page.settings": typeof PAGE_SETTINGS_DIALOG
    "book.settings": typeof BOOK_SETTINGS_DIALOG
  }
}
