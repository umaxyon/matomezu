// 図面のプラグイン: ページごとに紙を置く図面のブックと、その上に置く箱
import { defineBuiltin } from "../../../store/plugin"
import { BOX } from "./box"
import { DRAWING } from "./drawing"
import { DRAWING_MESSAGES } from "./messages"

export const DRAWING_PLUGIN = defineBuiltin({
  id: "@matomezu/drawing",
  bookTypes: [DRAWING],
  items: [BOX],
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
