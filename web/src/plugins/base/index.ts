// 土台のプラグイン: ステージ（ホームを開く・分割・閉じる）・ブックを開く・ページ・紙・設定・標準のテーマ。
// 画面の骨組みのウィジェット（ui.tsx）がここのコマンドを呼ぶ
import { defineDialog } from "../../store/dialogs"
import { defineBuiltin } from "../../store/plugin"
import { BOOK_OPEN, PAGE_NEW, PAGE_OPEN } from "./book-commands"
import { BASE_MESSAGES } from "./messages"
import { PAGE_ADD } from "./page-add"
import { A3, A4, A5 } from "./papers"
import { SET_LANG, SET_SKIN } from "./settings-actions"
import { SETTINGS_LANG, SETTINGS_SKIN } from "./settings-commands"
import { STAGE_CLOSE, STAGE_HOME, STAGE_SPLIT, STAGE_UNSPLIT } from "./stage-commands"
import { STANDARD } from "./standard"

export const OPEN_BOOK_DIALOG = defineDialog({ id: "book.open" })
export const NEW_PAGE_DIALOG = defineDialog({ id: "page.new" })

export const PAPERS = [A5, A4, A3] as const
export const PAPER_IDS = PAPERS.map(p => p.id)

export const BASE = defineBuiltin({
  id: "@matomezu/base",
  actions: [PAGE_ADD, SET_LANG, SET_SKIN],
  themes: [STANDARD],
  papers: PAPERS,
  commands: [
    STAGE_HOME,
    STAGE_SPLIT,
    STAGE_UNSPLIT,
    STAGE_CLOSE,
    BOOK_OPEN,
    PAGE_NEW,
    PAGE_OPEN,
    SETTINGS_LANG,
    SETTINGS_SKIN,
  ],
  dialogs: [OPEN_BOOK_DIALOG, NEW_PAGE_DIALOG],
  messages: BASE_MESSAGES,
})

declare module "../../core/tables" {
  interface MessageTable extends Readonly<typeof BASE_MESSAGES> {}
  interface ActionTable {
    "page.add": typeof PAGE_ADD
    "settings.lang": typeof SET_LANG
    "settings.skin": typeof SET_SKIN
  }
  interface ThemeTable {
    standard: typeof STANDARD
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
    "book.open": typeof BOOK_OPEN
    "page.new": typeof PAGE_NEW
    "page.open": typeof PAGE_OPEN
    "settings.lang": typeof SETTINGS_LANG
    "settings.skin": typeof SETTINGS_SKIN
  }
  interface DialogTable {
    "book.open": typeof OPEN_BOOK_DIALOG
    "page.new": typeof NEW_PAGE_DIALOG
  }
}
