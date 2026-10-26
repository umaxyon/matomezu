// 図面のプラグイン: 図面のブックのタイプ。使うアイテム・アクション・設定の項目・見せ方は、ほかのプラグインの定義を id で選ぶ（drawing.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { DRAWING } from "./drawing"
import { kit } from "./kit"

export const DRAWING_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [DRAWING],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/drawing:drawing": typeof DRAWING
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
