// スライドのブックのプラグイン: スライドのブックのタイプと、その見せ方。スライドのアイテムとアクションは slide プラグインの物
import { defineBuiltin } from "../../../plugin-api/builtin"
import { SLIDE_DELETE, SLIDE_KEYS, SLIDE_MOVE_TO, SLIDE_PUT, SLIDE_RESET, SLIDE_RESHAPE, SLIDE_SET } from "./commands"
import { kit } from "./kit"
import { SLIDE_PRINT } from "./print-setting"
import { SLIDE_BOOK, SLIDE_KEY_SCOPE, SLIDE_PRESENTATION } from "./slide-book"

export const SLIDE_BOOK_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [SLIDE_BOOK],
    presentations: [SLIDE_PRESENTATION],
    settings: [SLIDE_PRINT],
    commands: [SLIDE_PUT, SLIDE_MOVE_TO, SLIDE_RESHAPE, SLIDE_SET, SLIDE_RESET, SLIDE_DELETE],
    keys: SLIDE_KEYS,
    keyScopes: [SLIDE_KEY_SCOPE],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/slide-book:slide": typeof SLIDE_BOOK
  }
  interface CommandTable {
    "@matomezu/slide-book:slide-put": typeof SLIDE_PUT
    "@matomezu/slide-book:slide-move-to": typeof SLIDE_MOVE_TO
    "@matomezu/slide-book:slide-reshape": typeof SLIDE_RESHAPE
    "@matomezu/slide-book:slide-set": typeof SLIDE_SET
    "@matomezu/slide-book:slide-reset": typeof SLIDE_RESET
    "@matomezu/slide-book:slide-delete": typeof SLIDE_DELETE
  }
  interface SettingTable {
    "@matomezu/slide-book:slide-print": typeof SLIDE_PRINT
  }
  interface KeyScopeTable {
    "@matomezu/slide-book:slide": typeof SLIDE_KEY_SCOPE // スライドの見せ方で描いている間のキー
  }
  interface PresentationTable {
    "@matomezu/slide-book:slide": typeof SLIDE_PRESENTATION
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
