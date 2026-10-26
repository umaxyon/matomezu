// リストのプラグイン: リストのアイテム（見出しと行）と、行の操作のアクションとコマンド、リストと行の追加・編集のダイアログ
import { defineBuiltin } from "../../../plugin-api/builtin"
import { ROW_ADD, ROW_CHECK, ROW_LINES, ROW_MOVE, ROW_REMOVE, ROW_UPDATE } from "./actions"
import { LIST_ADD_ROW, LIST_CHECK, LIST_DELETE_ROW, LIST_EDIT_ROW, LIST_MOVE_ROW, LIST_STRETCH_ROW } from "./commands"
import { kit } from "./kit"
import { LIST, LIST_ADD_DIALOG, LIST_EDIT_DIALOG, ROW_ADD_DIALOG, ROW_EDIT_DIALOG } from "./list"

export const LIST_PLUGIN = defineBuiltin(
  kit.plugin({
    items: [LIST],
    actions: [ROW_ADD, ROW_UPDATE, ROW_REMOVE, ROW_CHECK, ROW_LINES, ROW_MOVE],
    commands: [LIST_ADD_ROW, LIST_EDIT_ROW, LIST_DELETE_ROW, LIST_CHECK, LIST_STRETCH_ROW, LIST_MOVE_ROW],
    dialogs: [LIST_ADD_DIALOG, LIST_EDIT_DIALOG, ROW_ADD_DIALOG, ROW_EDIT_DIALOG],
  }),
)

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/list:shape-list": typeof LIST
  }
  interface ActionTable {
    "@matomezu/list:row-add": typeof ROW_ADD
    "@matomezu/list:row-update": typeof ROW_UPDATE
    "@matomezu/list:row-remove": typeof ROW_REMOVE
    "@matomezu/list:row-check": typeof ROW_CHECK
    "@matomezu/list:row-lines": typeof ROW_LINES
    "@matomezu/list:row-move": typeof ROW_MOVE
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface CommandTable {
    "@matomezu/list:list-add-row": typeof LIST_ADD_ROW
    "@matomezu/list:list-edit-row": typeof LIST_EDIT_ROW
    "@matomezu/list:list-delete-row": typeof LIST_DELETE_ROW
    "@matomezu/list:list-check": typeof LIST_CHECK
    "@matomezu/list:list-stretch-row": typeof LIST_STRETCH_ROW
    "@matomezu/list:list-move-row": typeof LIST_MOVE_ROW
  }
  interface DialogTable {
    "@matomezu/list:list-add": typeof LIST_ADD_DIALOG
    "@matomezu/list:list-edit": typeof LIST_EDIT_DIALOG
    "@matomezu/list:row-add": typeof ROW_ADD_DIALOG
    "@matomezu/list:row-edit": typeof ROW_EDIT_DIALOG
  }
}
