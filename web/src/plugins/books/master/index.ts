// マスターのプラグイン: マスターのブック（1 冊だけのタイプ）と、その画面の機能（ブックを作る）。
// app のホームにすると（createMatomezu の home: "master"）、ブックの一覧を変えるアクションを許すかはマスターのタイプが決める。
// マスターの画面は土台のプラグイン（base）の設定のコマンドを使う。組織ごとのホームは、このプラグインの代わりに自分のものを渡す
import { defineDialog } from "../../../store/dialogs"
import { defineBuiltin } from "../../../store/plugin"
import { BOOK_CREATE } from "./book-create"
import { BOOK_NEW } from "./commands"
import { MASTER } from "./master"

export { MASTER_BOOK } from "./master"

import { MASTER_MESSAGES } from "./messages"

export const NEW_BOOK_DIALOG = defineDialog({ id: "book.new" })

export const MASTER_PLUGIN = defineBuiltin({
  id: "@matomezu/master",
  bookTypes: [MASTER],
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
  interface MessageTable extends Readonly<typeof MASTER_MESSAGES> {}
}

declare module "../../../store/tables" {
  interface CommandTable {
    "book.new": typeof BOOK_NEW
  }
  interface DialogTable {
    "book.new": typeof NEW_BOOK_DIALOG
  }
}
