// データのプラグイン: 中に 2 次元の表を持ち、表かグラフで見せるアイテム（データ）と、その表を入れ替えるアクション、テーマキーの値の確かめ
import { defineBuiltin } from "../../../plugin-api/builtin"
import { DATA_SET } from "./actions"
import { DATA_TOKENS_CHECK } from "./check"
import { DATA, DATA_EDIT_DIALOG, DATA_TOKENS } from "./data"
import { kit } from "./kit"

export const DATA_PLUGIN = defineBuiltin(
  kit.plugin({
    items: [DATA],
    actions: [DATA_SET],
    dialogs: [DATA_EDIT_DIALOG],
    tokens: DATA_TOKENS,
    checks: [DATA_TOKENS_CHECK],
  }),
)

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/data:shape-data": typeof DATA
  }
  interface ActionTable {
    "@matomezu/data:data-set": typeof DATA_SET
  }
  interface DialogTable {
    "@matomezu/data:data-edit": typeof DATA_EDIT_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
