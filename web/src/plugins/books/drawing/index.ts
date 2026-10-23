// 図面のプラグイン: 図面のブックのタイプ。使うアイテム・アクション・設定の項目・見せ方は、ほかのプラグインの定義を id で選ぶ（drawing.ts）
import { defineBuiltin } from "../../../store/plugin"
import { DRAWING } from "./drawing"
import { DRAWING_MESSAGES } from "./messages"

export const DRAWING_PLUGIN = defineBuiltin({
  id: "@matomezu/drawing",
  bookTypes: [DRAWING],
  messages: DRAWING_MESSAGES,
})

declare module "../../../core/tables" {
  interface BookTypeTable {
    drawing: typeof DRAWING
  }
  interface MessageTable extends Readonly<typeof DRAWING_MESSAGES> {}
}
