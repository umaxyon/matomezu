// マスターのプラグイン: マスターのブック（1 冊だけのタイプ）と、その画面の機能（ブックを作る）。
// インスタンスのホームにすると（createMatomezu の home: "master"）、ブックの一覧を変えるアクションを許すかはマスターのタイプが決める。
// マスターの画面は base の設定のコマンドを使う。組織ごとのホームは、このプラグインの代わりに自分のものを渡す
import { defineBuiltin } from "../../../store/plugin"
import { BOOK_CREATE, BOOK_NEW, NEW_BOOK_DIALOG } from "./book-new"
import { MASTER, MASTER_PRESENTATION } from "./master"

export { MASTER_BOOK } from "./master"

import { MASTER_MESSAGES } from "./messages"

export { NEW_BOOK_DIALOG }

export const MASTER_PLUGIN = defineBuiltin({
  id: "@matomezu/master",
  bookTypes: [MASTER],
  presentations: [MASTER_PRESENTATION],
  actions: [BOOK_CREATE],
  commands: [BOOK_NEW],
  dialogs: [NEW_BOOK_DIALOG],
  messages: MASTER_MESSAGES,
})

declare module "../../../core/tables" {
  interface BookTypeTable {
    master: typeof MASTER
  }
  interface ActionTable {
    "book.create": typeof BOOK_CREATE
  }
  interface PresentationTable {
    master: typeof MASTER_PRESENTATION
  }
  interface MessageTable extends Readonly<typeof MASTER_MESSAGES> {}
  interface CommandTable {
    "book.new": typeof BOOK_NEW
  }
  interface DialogTable {
    "book.new": typeof NEW_BOOK_DIALOG
  }
}
