// 図面のプラグイン: ページごとに紙を置く図面のブックと、その上に置く箱・置く・動かす・消す操作とそのキー、図面の設定
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
import { DRAWING_MESSAGES } from "./messages"
import { DRAWING_SETTINGS, DRAWING_SETTINGS_DIALOG } from "./settings"
import { SIMPLE, STICKY } from "./themes"

export const DRAWING_PLUGIN = defineBuiltin({
  id: "@matomezu/drawing",
  bookTypes: [DRAWING],
  items: [BOX],
  themes: [STICKY, SIMPLE],
  actions: [ITEM_PLACE, ITEM_MOVE, ITEM_UPDATE, ITEM_RESIZE, ITEM_REMOVE],
  commands: [DRAWING_SETTINGS, DRAWING_PLACE, DRAWING_MOVE, DRAWING_RESIZE, DRAWING_EDIT, DRAWING_DELETE],
  dialogs: [DRAWING_SETTINGS_DIALOG, BOX_ADD_DIALOG, BOX_EDIT_DIALOG],
  keys: ITEM_KEYS,
  messages: DRAWING_MESSAGES,
})

declare module "../../../core/tables" {
  interface BookTypeTable {
    drawing: typeof DRAWING
  }
  interface ItemTable {
    "shape.box": typeof BOX
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
  }
  interface DialogTable {
    "drawing.settings": typeof DRAWING_SETTINGS_DIALOG
    "box.add": typeof BOX_ADD_DIALOG
    "box.edit": typeof BOX_EDIT_DIALOG
  }
}
