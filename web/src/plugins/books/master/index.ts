// マスターのプラグイン: マスターのブック（1 冊だけのタイプ）と、その画面。ブックを作るアクション・ダイアログ・コマンドは base のものを使う。
// インスタンスのホームにすると（createMatomezu の home: MASTER.id）、ブックの一覧を変えるアクションを許すかはマスターのタイプが決める。
// マスターの画面は base の設定のコマンドを使う。組織ごとのホームは、このプラグインの代わりに自分のものを渡す
import { defineBuiltin } from "../../../plugin-api/builtin"
import { kit } from "./kit"
import { MASTER, MASTER_PRESENTATION } from "./master"

export { MASTER_BOOK } from "./master"

export const MASTER_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [MASTER],
    presentations: [MASTER_PRESENTATION],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/master:master": typeof MASTER
  }
  interface PresentationTable {
    "@matomezu/master:master": typeof MASTER_PRESENTATION
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
