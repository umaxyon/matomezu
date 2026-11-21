// 図面のプラグイン: 図面のページのタイプ。使うアイテム・アクション・設定の項目・プレゼンテーションは、ほかのプラグインの定義を id で選ぶ（drawing.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { DRAWING } from "./drawing"
import { kit } from "./kit"
import { DRAWING_NODE_ICON } from "./node-icon"

export const DRAWING_PLUGIN = defineBuiltin(
  kit.plugin({
    pageTypes: [DRAWING],
    enumValues: [DRAWING_NODE_ICON],
  }),
)

declare module "../../../core/catalog" {
  interface EnumValueTable {
    "@matomezu/drawing:node-icon": typeof DRAWING_NODE_ICON
  }
  interface PageTypeTable {
    "@matomezu/drawing:drawing": typeof DRAWING
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
