// 土台のプラグイン: マスター（ブックの一覧と設定）・ステージ・ページ・紙・標準のテーマ。
// 画面の骨組み（フッタのメニュー・タブ）がここのコマンドを呼ぶので、app には必ず渡す。
// マスターのタイプがブックを作るアクション（book.create）を許すので、ブックの一覧もここに持つ
import { defineDialog } from "../../store/dialogs"
import { defineBuiltin } from "../../store/plugin"
import { BOOK_NEW, BOOK_OPEN, PAGE_NEW, PAGE_OPEN } from "./book-commands"
import { BOOK_CREATE } from "./book-create"
import { MASTER } from "./master"
import { PAGE_ADD } from "./page-add"
import { A3, A4, A5 } from "./papers"
import { SETTINGS_LANG, SETTINGS_SKIN } from "./settings-commands"
import { STAGE_CLOSE, STAGE_MASTER, STAGE_SPLIT, STAGE_UNSPLIT } from "./stage-commands"
import { STANDARD } from "./standard"

export const OPEN_BOOK_DIALOG = defineDialog({ id: "book.open" })
export const NEW_BOOK_DIALOG = defineDialog({ id: "book.new" })
export const NEW_PAGE_DIALOG = defineDialog({ id: "page.new" })

export const PAPERS = [A5, A4, A3] as const
export const PAPER_IDS = PAPERS.map(p => p.id)

export const BASE = defineBuiltin({
  id: "@matomezu/base",
  bookTypes: [MASTER],
  actions: [BOOK_CREATE, PAGE_ADD],
  themes: [STANDARD],
  papers: PAPERS,
  commands: [
    STAGE_MASTER,
    STAGE_SPLIT,
    STAGE_UNSPLIT,
    STAGE_CLOSE,
    BOOK_OPEN,
    BOOK_NEW,
    PAGE_NEW,
    PAGE_OPEN,
    SETTINGS_LANG,
    SETTINGS_SKIN,
  ],
  dialogs: [OPEN_BOOK_DIALOG, NEW_BOOK_DIALOG, NEW_PAGE_DIALOG],
})

declare module "../../core/tables" {
  interface BookTypeTable {
    master: typeof MASTER
  }
  interface ActionTable {
    "book.create": typeof BOOK_CREATE
    "page.add": typeof PAGE_ADD
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
    "stage.master": typeof STAGE_MASTER
    "stage.split": typeof STAGE_SPLIT
    "stage.unsplit": typeof STAGE_UNSPLIT
    "stage.close": typeof STAGE_CLOSE
    "book.open": typeof BOOK_OPEN
    "book.new": typeof BOOK_NEW
    "page.new": typeof PAGE_NEW
    "page.open": typeof PAGE_OPEN
    "settings.lang": typeof SETTINGS_LANG
    "settings.skin": typeof SETTINGS_SKIN
  }
  interface DialogTable {
    "book.open": typeof OPEN_BOOK_DIALOG
    "book.new": typeof NEW_BOOK_DIALOG
    "page.new": typeof NEW_PAGE_DIALOG
  }
}
