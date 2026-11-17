// ex8: 自分のプレゼンテーション（definePresentation）と、自分のテーマタイプ（単語帳）とそのテーマ（黒板）を持つ追加プラグイン。プレゼンテーションのビューと、印刷プレビューで印刷区画 1 つを描くビュー（printSheet）を結ぶ（ui.tsx）。
// ビューの並べ方を、画面の場所に入れるプラグイン状態として宣言し（definePluginState）、画面の場所に入れて、読み直しても戻す
import { definePlugin } from "matomezu"
import { CARDS, CHALK, DECK, DECK_ORDER, DECK_PICKED } from "./deck"
import { kit } from "./kit"

export const EX8 = definePlugin(
  kit.plugin({ pageTypes: [DECK], presentations: [CARDS], themes: [CHALK], pluginStates: [DECK_ORDER, DECK_PICKED] }),
)

export default EX8

declare module "matomezu/catalog" {
  interface PageTypeTable {
    "ex8:deck": typeof DECK
  }
  interface PluginStateTable {
    "ex8:order": typeof DECK_ORDER
    "ex8:picked": typeof DECK_PICKED
  }
  interface PresentationTable {
    "ex8:cards": typeof CARDS
  }
  interface ThemeTable {
    "ex8:chalk": typeof CHALK
  }
  interface ThemeTypeTable {
    "ex8:cards": true // 単語帳のテーマタイプ（自分で足す）
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
