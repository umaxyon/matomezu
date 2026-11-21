// スライドのページのプラグイン: スライドのページのタイプと、そのプレゼンテーション。描画シェイプとアクションは slide プラグインの物
import { defineBuiltin } from "../../../plugin-api/builtin"
import { kit } from "./kit"
import { SLIDE_PAGE_NODE_ICON } from "./node-icon"
import { SLIDE_PRINT } from "./print-setting"
import { SLIDE_PAGE, SLIDE_PRESENTATION } from "./slide-page"

export const SLIDE_PAGE_PLUGIN = defineBuiltin(
  kit.plugin({
    pageTypes: [SLIDE_PAGE],
    enumValues: [SLIDE_PAGE_NODE_ICON],
    presentations: [SLIDE_PRESENTATION],
    settings: [SLIDE_PRINT],
  }),
)

declare module "../../../core/catalog" {
  interface EnumValueTable {
    "@matomezu/slide-page:node-icon": typeof SLIDE_PAGE_NODE_ICON
  }
  interface PageTypeTable {
    "@matomezu/slide-page:slide": typeof SLIDE_PAGE
  }
  interface SettingTable {
    "@matomezu/slide-page:slide-print": typeof SLIDE_PRINT
  }
  interface PresentationTable {
    "@matomezu/slide-page:slide": typeof SLIDE_PRESENTATION
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
