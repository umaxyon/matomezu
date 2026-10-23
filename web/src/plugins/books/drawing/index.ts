// 図面のプラグイン: ページごとに紙を置く図面のブックと、その上に置く箱・リスト（と行の操作）・線・置く・動かす・消す操作とそのキー、図面の設定
import { defineBuiltin } from "../../../store/plugin"
import { BOX, BOX_ADD_DIALOG, BOX_EDIT_DIALOG } from "./box"
import { DRAWING } from "./drawing"
import {
  DRAWING_DELETE,
  DRAWING_EDIT,
  DRAWING_MOVE,
  DRAWING_PLACE,
  DRAWING_RESIZE,
  ITEM_KEYS,
  ITEM_MOVE,
  ITEM_PLACE,
  ITEM_REMOVE,
  ITEM_RESIZE,
  ITEM_UPDATE,
} from "./items"
import { LINE, LINE_EDIT_DIALOG, LINE_ROUTE } from "./line"
import { LINE_CONNECT, LINE_RECONNECT, LINE_UPDATE } from "./line/actions"
import { LINE_DRAW, LINE_EDIT, LINE_RECONNECT_DROP } from "./line/commands"
import { LIST, LIST_ADD_DIALOG, LIST_EDIT_DIALOG, ROW_ADD_DIALOG, ROW_EDIT_DIALOG } from "./list"
import { ROW_ADD, ROW_CHECK, ROW_LINES, ROW_MOVE, ROW_REMOVE, ROW_UPDATE } from "./list/actions"
import {
  LIST_ADD_ROW,
  LIST_CHECK,
  LIST_DELETE_ROW,
  LIST_EDIT_ROW,
  LIST_MOVE_ROW,
  LIST_STRETCH_ROW,
} from "./list/commands"
import { DRAWING_MESSAGES } from "./messages"
import { DRAWING_SETTINGS, DRAWING_SETTINGS_DIALOG, PAGE_SETTINGS, PAGE_SETTINGS_DIALOG } from "./settings"
import { SIMPLE, STICKY } from "./themes"

export const DRAWING_PLUGIN = defineBuiltin({
  id: "@matomezu/drawing",
  bookTypes: [DRAWING],
  items: [BOX, LIST, LINE],
  settings: [LINE_ROUTE],
  themes: [STICKY, SIMPLE],
  actions: [
    ITEM_PLACE,
    ITEM_MOVE,
    ITEM_UPDATE,
    ITEM_RESIZE,
    ITEM_REMOVE,
    ROW_ADD,
    ROW_UPDATE,
    ROW_REMOVE,
    ROW_CHECK,
    ROW_LINES,
    ROW_MOVE,
    LINE_CONNECT,
    LINE_UPDATE,
    LINE_RECONNECT,
  ],
  commands: [
    DRAWING_SETTINGS,
    DRAWING_PLACE,
    DRAWING_MOVE,
    DRAWING_RESIZE,
    DRAWING_EDIT,
    DRAWING_DELETE,
    LIST_ADD_ROW,
    LIST_EDIT_ROW,
    LIST_DELETE_ROW,
    LIST_CHECK,
    LIST_STRETCH_ROW,
    LIST_MOVE_ROW,
    LINE_DRAW,
    LINE_EDIT,
    LINE_RECONNECT_DROP,
    PAGE_SETTINGS,
  ],
  dialogs: [
    DRAWING_SETTINGS_DIALOG,
    BOX_ADD_DIALOG,
    BOX_EDIT_DIALOG,
    LIST_ADD_DIALOG,
    LIST_EDIT_DIALOG,
    ROW_ADD_DIALOG,
    ROW_EDIT_DIALOG,
    LINE_EDIT_DIALOG,
    PAGE_SETTINGS_DIALOG,
  ],
  keys: ITEM_KEYS,
  messages: DRAWING_MESSAGES,
})

declare module "../../../core/tables" {
  interface BookTypeTable {
    drawing: typeof DRAWING
  }
  interface ItemTable {
    "shape.box": typeof BOX
    "shape.list": typeof LIST
    "connector.line": typeof LINE
  }
  interface SettingTable {
    "line.route": typeof LINE_ROUTE
  }
  interface ThemeTable {
    sticky: typeof STICKY
    simple: typeof SIMPLE
  }
  interface ActionTable {
    "item.place": typeof ITEM_PLACE
    "item.move": typeof ITEM_MOVE
    "item.update": typeof ITEM_UPDATE
    "item.resize": typeof ITEM_RESIZE
    "item.remove": typeof ITEM_REMOVE
    "row.add": typeof ROW_ADD
    "row.update": typeof ROW_UPDATE
    "row.remove": typeof ROW_REMOVE
    "row.check": typeof ROW_CHECK
    "row.lines": typeof ROW_LINES
    "row.move": typeof ROW_MOVE
    "line.connect": typeof LINE_CONNECT
    "line.update": typeof LINE_UPDATE
    "line.reconnect": typeof LINE_RECONNECT
  }
  interface MessageTable extends Readonly<typeof DRAWING_MESSAGES> {}
}

declare module "../../../store/tables" {
  interface CommandTable {
    "drawing.settings": typeof DRAWING_SETTINGS
    "drawing.place": typeof DRAWING_PLACE
    "drawing.move": typeof DRAWING_MOVE
    "drawing.resize": typeof DRAWING_RESIZE
    "drawing.edit": typeof DRAWING_EDIT
    "drawing.delete": typeof DRAWING_DELETE
    "list.addRow": typeof LIST_ADD_ROW
    "list.editRow": typeof LIST_EDIT_ROW
    "list.deleteRow": typeof LIST_DELETE_ROW
    "list.check": typeof LIST_CHECK
    "list.stretchRow": typeof LIST_STRETCH_ROW
    "list.moveRow": typeof LIST_MOVE_ROW
    "line.draw": typeof LINE_DRAW
    "line.edit": typeof LINE_EDIT
    "line.drop": typeof LINE_RECONNECT_DROP
    "page.settings": typeof PAGE_SETTINGS
  }
  interface DialogTable {
    "drawing.settings": typeof DRAWING_SETTINGS_DIALOG
    "box.add": typeof BOX_ADD_DIALOG
    "box.edit": typeof BOX_EDIT_DIALOG
    "list.add": typeof LIST_ADD_DIALOG
    "list.edit": typeof LIST_EDIT_DIALOG
    "row.add": typeof ROW_ADD_DIALOG
    "row.edit": typeof ROW_EDIT_DIALOG
    "line.edit": typeof LINE_EDIT_DIALOG
    "page.settings": typeof PAGE_SETTINGS_DIALOG
  }
}
