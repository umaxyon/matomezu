// スライドのブックのプラグイン: スライドのブックのタイプと、その見せ方。スライドのアイテムとアクションは slide プラグインの物
import { defineBuiltin } from "../../../plugin-api/builtin"
import { SLIDE_BOOK_ENTRY_ICON } from "./entry-icon"
import { kit } from "./kit"
import { SLIDE_PRINT } from "./print-setting"
import { SLIDE_BOOK, SLIDE_PRESENTATION } from "./slide-book"

export const SLIDE_BOOK_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [SLIDE_BOOK],
    enumValues: [SLIDE_BOOK_ENTRY_ICON],
    presentations: [SLIDE_PRESENTATION],
    settings: [SLIDE_PRINT],
  }),
)

declare module "../../../core/catalog" {
  interface EnumValueTable {
    "@matomezu/slide-book:entry-icon": typeof SLIDE_BOOK_ENTRY_ICON
  }
  interface BookTypeTable {
    "@matomezu/slide-book:slide": typeof SLIDE_BOOK
  }
  interface SettingTable {
    "@matomezu/slide-book:slide-print": typeof SLIDE_PRINT
  }
  interface PresentationTable {
    "@matomezu/slide-book:slide": typeof SLIDE_PRESENTATION
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
