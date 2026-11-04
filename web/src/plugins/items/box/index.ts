// 箱のプラグイン: 箱のアイテム（キャプションと本文の四角）と内包ボックス（同じ見た目で子の形を持てる）と、その追加と編集のダイアログ
import { defineBuiltin } from "../../../plugin-api/builtin"
import { BOX, BOX_ADD_DIALOG, BOX_EDIT_DIALOG, BOX_TOKENS, NEST_BOX, NEST_BOX_ADD_DIALOG } from "./box"
import { kit } from "./kit"

export const BOX_PLUGIN = defineBuiltin(
  kit.plugin({
    items: [BOX, NEST_BOX],
    dialogs: [BOX_ADD_DIALOG, BOX_EDIT_DIALOG, NEST_BOX_ADD_DIALOG],
    tokens: BOX_TOKENS,
  }),
)

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/box:shape-box": typeof BOX
    "@matomezu/box:shape-nest-box": typeof NEST_BOX
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface DialogTable {
    "@matomezu/box:box-add": typeof BOX_ADD_DIALOG
    "@matomezu/box:box-edit": typeof BOX_EDIT_DIALOG
    "@matomezu/box:nest-box-add": typeof NEST_BOX_ADD_DIALOG
  }
}
