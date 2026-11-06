// ex8: 自分の見せ方（definePresentation）を持つ追加プラグイン。見せ方のビューと、印刷プレビューで印刷区画 1 つを描くビュー（printSheet）を結ぶ（ui.tsx）
import { definePlugin } from "matomezu"
import { CARDS, DECK } from "./deck"
import { kit } from "./kit"

export const EX8 = definePlugin(kit.plugin({ bookTypes: [DECK], presentations: [CARDS] }))

export default EX8

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex8:deck": typeof DECK
  }
  interface PresentationTable {
    "ex8:cards": typeof CARDS
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
