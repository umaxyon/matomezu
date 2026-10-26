// 線のプラグイン: 形どうしをつなぐ線のアイテムと、線の既定の通り方の設定の項目、線を引く・変える・つなぎ替えるアクションとコマンド、線の編集のダイアログ
import { defineBuiltin } from "../../../plugin-api/builtin"
import { LINE_CONNECT, LINE_RECONNECT, LINE_UPDATE } from "./actions"
import { LINE_DRAW, LINE_EDIT, LINE_RECONNECT_DROP } from "./commands"
import { kit } from "./kit"
import { LINE, LINE_EDIT_DIALOG, LINE_ROUTE } from "./line"

export const LINE_PLUGIN = defineBuiltin(
  kit.plugin({
    items: [LINE],
    settings: [LINE_ROUTE],
    actions: [LINE_CONNECT, LINE_UPDATE, LINE_RECONNECT],
    commands: [LINE_DRAW, LINE_EDIT, LINE_RECONNECT_DROP],
    dialogs: [LINE_EDIT_DIALOG],
  }),
)

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/line:connector-line": typeof LINE
  }
  interface SettingTable {
    "@matomezu/line:line-route": typeof LINE_ROUTE
  }
  interface ActionTable {
    "@matomezu/line:line-connect": typeof LINE_CONNECT
    "@matomezu/line:line-update": typeof LINE_UPDATE
    "@matomezu/line:line-reconnect": typeof LINE_RECONNECT
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface CommandTable {
    "@matomezu/line:line-draw": typeof LINE_DRAW
    "@matomezu/line:line-edit": typeof LINE_EDIT
    "@matomezu/line:line-drop": typeof LINE_RECONNECT_DROP
  }
  interface DialogTable {
    "@matomezu/line:line-edit": typeof LINE_EDIT_DIALOG
  }
}
