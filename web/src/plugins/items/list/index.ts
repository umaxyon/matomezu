// リストのプラグイン: リストのアイテム（見出しと行）と、行の操作のアクションとコマンド、リストと行の追加・編集のダイアログ
import { defineBuiltin } from "../../../store/plugin"
import { ROW_ADD, ROW_CHECK, ROW_LINES, ROW_MOVE, ROW_REMOVE, ROW_UPDATE } from "./actions"
import { LIST_ADD_ROW, LIST_CHECK, LIST_DELETE_ROW, LIST_EDIT_ROW, LIST_MOVE_ROW, LIST_STRETCH_ROW } from "./commands"
import { LIST, LIST_ADD_DIALOG, LIST_EDIT_DIALOG, ROW_ADD_DIALOG, ROW_EDIT_DIALOG } from "./list"
import { LIST_MESSAGES } from "./messages"

export const LIST_PLUGIN = defineBuiltin({
  id: "@matomezu/list",
  items: [LIST],
  actions: [ROW_ADD, ROW_UPDATE, ROW_REMOVE, ROW_CHECK, ROW_LINES, ROW_MOVE],
  commands: [LIST_ADD_ROW, LIST_EDIT_ROW, LIST_DELETE_ROW, LIST_CHECK, LIST_STRETCH_ROW, LIST_MOVE_ROW],
  dialogs: [LIST_ADD_DIALOG, LIST_EDIT_DIALOG, ROW_ADD_DIALOG, ROW_EDIT_DIALOG],
  messages: LIST_MESSAGES,
})

declare module "../../../core/tables" {
  interface ItemTable {
    "shape.list": typeof LIST
  }
  interface ActionTable {
    "row.add": typeof ROW_ADD
    "row.update": typeof ROW_UPDATE
    "row.remove": typeof ROW_REMOVE
    "row.check": typeof ROW_CHECK
    "row.lines": typeof ROW_LINES
    "row.move": typeof ROW_MOVE
  }
  interface MessageTable extends Readonly<typeof LIST_MESSAGES> {}
  interface CommandTable {
    "list.addRow": typeof LIST_ADD_ROW
    "list.editRow": typeof LIST_EDIT_ROW
    "list.deleteRow": typeof LIST_DELETE_ROW
    "list.check": typeof LIST_CHECK
    "list.stretchRow": typeof LIST_STRETCH_ROW
    "list.moveRow": typeof LIST_MOVE_ROW
  }
  interface DialogTable {
    "list.add": typeof LIST_ADD_DIALOG
    "list.edit": typeof LIST_EDIT_DIALOG
    "row.add": typeof ROW_ADD_DIALOG
    "row.edit": typeof ROW_EDIT_DIALOG
  }
}
