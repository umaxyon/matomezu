// ex8: 自分の見せ方（definePresentation）と、自分のテーマタイプ（単語帳）とそのテーマ（黒板）を持つ追加プラグイン。見せ方のビューと、印刷プレビューで印刷区画 1 つを描くビュー（printSheet）を結ぶ（ui.tsx）
import { definePlugin } from "matomezu"
import { CARDS, CHALK, DECK } from "./deck"
import { kit } from "./kit"

export const EX8 = definePlugin(kit.plugin({ bookTypes: [DECK], presentations: [CARDS], themes: [CHALK] }))

export default EX8

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex8:deck": typeof DECK
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
