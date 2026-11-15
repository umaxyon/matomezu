// 図面のプラグイン: 図面のページのタイプ。使うアイテム・アクション・設定の項目・見せ方は、ほかのプラグインの定義を id で選ぶ（drawing.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { DRAWING } from "./drawing"
import { DRAWING_ENTRY_ICON } from "./entry-icon"
import { kit } from "./kit"

export const DRAWING_PLUGIN = defineBuiltin(
  kit.plugin({
    pageTypes: [DRAWING],
    enumValues: [DRAWING_ENTRY_ICON],
  }),
)

declare module "../../../core/catalog" {
  interface EnumValueTable {
    "@matomezu/drawing:entry-icon": typeof DRAWING_ENTRY_ICON
  }
  interface PageTypeTable {
    "@matomezu/drawing:drawing": typeof DRAWING
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
