// 追加プラグインのブックのタイプの見本（React なし）: タイプ・形・設定の項目・形のダイアログ
import { definePlugin } from "matomezu"
import { DIAMOND, DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG, FLOW, FLOW_DIRECTION } from "./flow"
import { FLOW_MESSAGES } from "./messages"

export const HOGE_FLOW = definePlugin({
  id: "hoge-flow",
  bookTypes: [FLOW],
  items: [DIAMOND],
  settings: [FLOW_DIRECTION],
  dialogs: [DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG],
  messages: FLOW_MESSAGES,
})

// ホストが動的に取り込むときは、default で出したプラグインを受け取る
export default HOGE_FLOW

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "hoge-flow/flow": typeof FLOW
  }
  interface ItemTable {
    "hoge-flow/diamond": typeof DIAMOND
  }
  interface SettingTable {
    "hoge-flow/flow.direction": typeof FLOW_DIRECTION
  }
  interface MessageTable extends Readonly<typeof FLOW_MESSAGES> {}
  interface DialogTable {
    "hoge-flow/diamond.add": typeof DIAMOND_ADD_DIALOG
    "hoge-flow/diamond.edit": typeof DIAMOND_EDIT_DIALOG
  }
}
