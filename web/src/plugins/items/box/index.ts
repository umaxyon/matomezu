// 箱のプラグイン: 箱のアイテム（キャプションと本文の四角）と、その追加と編集のダイアログ
import { defineBuiltin } from "../../../store/plugin"
import { BOX, BOX_ADD_DIALOG, BOX_EDIT_DIALOG } from "./box"
import { BOX_MESSAGES } from "./messages"

export const BOX_PLUGIN = defineBuiltin({
  id: "@matomezu/box",
  items: [BOX],
  dialogs: [BOX_ADD_DIALOG, BOX_EDIT_DIALOG],
  messages: BOX_MESSAGES,
})

declare module "../../../core/tables" {
  interface ItemTable {
    "shape.box": typeof BOX
  }
  interface MessageTable extends Readonly<typeof BOX_MESSAGES> {}
  interface DialogTable {
    "box.add": typeof BOX_ADD_DIALOG
    "box.edit": typeof BOX_EDIT_DIALOG
  }
}
