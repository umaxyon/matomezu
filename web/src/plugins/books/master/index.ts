// マスターのプラグイン: マスターのブック（1 冊だけのタイプ）と、その画面の機能（ブックを作る）。
// インスタンスのホームにすると（createMatomezu の home: MASTER.id）、ブックの一覧を変えるアクションを許すかはマスターのタイプが決める。
// マスターの画面は base の設定のコマンドを使う。組織ごとのホームは、このプラグインの代わりに自分のものを渡す
import { defineBuiltin } from "../../../plugin-api/builtin"
import { BOOK_CREATE, BOOK_NEW, NEW_BOOK_DIALOG } from "./book-new"
import { kit } from "./kit"
import { MASTER, MASTER_PRESENTATION } from "./master"

export { MASTER_BOOK } from "./master"

export { NEW_BOOK_DIALOG }

export const MASTER_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [MASTER],
    presentations: [MASTER_PRESENTATION],
    actions: [BOOK_CREATE],
    commands: [BOOK_NEW],
    dialogs: [NEW_BOOK_DIALOG],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/master:master": typeof MASTER
  }
  interface ActionTable {
    "@matomezu/master:book-create": typeof BOOK_CREATE
  }
  interface PresentationTable {
    "@matomezu/master:master": typeof MASTER_PRESENTATION
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface CommandTable {
    "@matomezu/master:book-new": typeof BOOK_NEW
  }
  interface DialogTable {
    "@matomezu/master:book-new": typeof NEW_BOOK_DIALOG
  }
}
