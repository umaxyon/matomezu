// 図面のプラグイン: ページごとに紙を置く図面のブックと、その上に置く箱・置く・動かす操作、図面の設定
import { defineBuiltin } from "../../../store/plugin"
import { BOX, BOX_ADD_DIALOG } from "./box"
import { DRAWING } from "./drawing"
import { DRAWING_MOVE, DRAWING_PLACE, ITEM_MOVE, ITEM_PLACE } from "./items"
import { DRAWING_MESSAGES } from "./messages"
import { DRAWING_SETTINGS, DRAWING_SETTINGS_DIALOG } from "./settings"

export const DRAWING_PLUGIN = defineBuiltin({
  id: "@matomezu/drawing",
  bookTypes: [DRAWING],
  items: [BOX],
  actions: [ITEM_PLACE, ITEM_MOVE],
  commands: [DRAWING_SETTINGS, DRAWING_PLACE, DRAWING_MOVE],
  dialogs: [DRAWING_SETTINGS_DIALOG, BOX_ADD_DIALOG],
  messages: DRAWING_MESSAGES,
})

declare module "../../../core/tables" {
  interface BookTypeTable {
    drawing: typeof DRAWING
  }
  interface ItemTable {
    "shape.box": typeof BOX
  }
  interface ActionTable {
    "item.place": typeof ITEM_PLACE
    "item.move": typeof ITEM_MOVE
  }
  interface MessageTable extends Readonly<typeof DRAWING_MESSAGES> {}
}

declare module "../../../store/tables" {
  interface CommandTable {
    "drawing.settings": typeof DRAWING_SETTINGS
    "drawing.place": typeof DRAWING_PLACE
    "drawing.move": typeof DRAWING_MOVE
  }
  interface DialogTable {
    "drawing.settings": typeof DRAWING_SETTINGS_DIALOG
    "box.add": typeof BOX_ADD_DIALOG
  }
}
