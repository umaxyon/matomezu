// 線のプラグイン: 形どうしをつなぐ線のアイテムと、線の既定の通り方の設定の項目、線を引く・変える・つなぎ替えるアクションとコマンド、線の編集のダイアログ
import { defineBuiltin } from "../../../store/plugin"
import { LINE_CONNECT, LINE_RECONNECT, LINE_UPDATE } from "./actions"
import { LINE_DRAW, LINE_EDIT, LINE_RECONNECT_DROP } from "./commands"
import { LINE, LINE_EDIT_DIALOG, LINE_ROUTE } from "./line"
import { LINE_MESSAGES } from "./messages"

export const LINE_PLUGIN = defineBuiltin({
  id: "@matomezu/line",
  items: [LINE],
  settings: [LINE_ROUTE],
  actions: [LINE_CONNECT, LINE_UPDATE, LINE_RECONNECT],
  commands: [LINE_DRAW, LINE_EDIT, LINE_RECONNECT_DROP],
  dialogs: [LINE_EDIT_DIALOG],
  messages: LINE_MESSAGES,
})

declare module "../../../core/catalog" {
  interface ItemTable {
    "connector.line": typeof LINE
  }
  interface SettingTable {
    "line.route": typeof LINE_ROUTE
  }
  interface ActionTable {
    "line.connect": typeof LINE_CONNECT
    "line.update": typeof LINE_UPDATE
    "line.reconnect": typeof LINE_RECONNECT
  }
  interface MessageTable extends Readonly<typeof LINE_MESSAGES> {}
  interface CommandTable {
    "line.draw": typeof LINE_DRAW
    "line.edit": typeof LINE_EDIT
    "line.drop": typeof LINE_RECONNECT_DROP
  }
  interface DialogTable {
    "line.edit": typeof LINE_EDIT_DIALOG
  }
}
