// 図面のプラグイン: ページごとに紙を置く図面のブックと、その上に置く箱、図面の設定
import { defineBuiltin } from "../../../store/plugin"
import { BOX } from "./box"
import { DRAWING } from "./drawing"
import { DRAWING_MESSAGES } from "./messages"
import { DRAWING_SETTINGS, DRAWING_SETTINGS_DIALOG } from "./settings"

export const DRAWING_PLUGIN = defineBuiltin({
  id: "@matomezu/drawing",
  bookTypes: [DRAWING],
  items: [BOX],
  commands: [DRAWING_SETTINGS],
  dialogs: [DRAWING_SETTINGS_DIALOG],
  messages: DRAWING_MESSAGES,
})

declare module "../../../core/tables" {
  interface BookTypeTable {
    drawing: typeof DRAWING
  }
  interface ItemTable {
    "shape.box": typeof BOX
  }
  interface MessageTable extends Readonly<typeof DRAWING_MESSAGES> {}
}

declare module "../../../store/tables" {
  interface CommandTable {
    "drawing.settings": typeof DRAWING_SETTINGS
  }
  interface DialogTable {
    "drawing.settings": typeof DRAWING_SETTINGS_DIALOG
  }
}
