// 箱のプラグイン: 箱のアイテム（キャプションと本文の四角）と、その追加と編集のダイアログ
import { defineBuiltin } from "../../../plugin-api/builtin"
import { BOX, BOX_ADD_DIALOG, BOX_EDIT_DIALOG } from "./box"
import { kit } from "./kit"

export const BOX_PLUGIN = defineBuiltin(
  kit.plugin({
    items: [BOX],
    dialogs: [BOX_ADD_DIALOG, BOX_EDIT_DIALOG],
  }),
)

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/box:shape-box": typeof BOX
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface DialogTable {
    "@matomezu/box:box-add": typeof BOX_ADD_DIALOG
    "@matomezu/box:box-edit": typeof BOX_EDIT_DIALOG
  }
}
