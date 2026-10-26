// ex2: 自分のブックのタイプと形と自分のアクションを持つ追加プラグイン（React なし）。
// ダイアログは usePerform でアクションを行う（追加のダイアログは置き、編集のダイアログは答える。views.tsx）
import { definePlugin } from "matomezu"
import { ANSWER, DIAMOND, DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG, FLOW, FLOW_DIRECTION } from "./flow"
import { kit } from "./kit"

export const EX2 = definePlugin(
  kit.plugin({
    bookTypes: [FLOW],
    items: [DIAMOND],
    actions: [ANSWER],
    settings: [FLOW_DIRECTION],
    dialogs: [DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG],
  }),
)

export default EX2

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex2:flow": typeof FLOW
  }
  interface ItemTable {
    "ex2:diamond": typeof DIAMOND
  }
  interface ActionTable {
    "ex2:diamond-answer": typeof ANSWER
  }
  interface SettingTable {
    "ex2:flow-direction": typeof FLOW_DIRECTION
  }
  interface DialogTable {
    "ex2:diamond-add": typeof DIAMOND_ADD_DIALOG
    "ex2:diamond-edit": typeof DIAMOND_EDIT_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
