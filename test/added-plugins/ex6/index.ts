// ex6: ほかのプラグインの形に答えてもらう機能を持つ追加プラグイン。答えてもらうメソッドは連携ポイント ex6-spec に置く（weight.ts）
import { definePlugin } from "matomezu"
import { kit } from "./kit"
import { PAGE_WEIGHT } from "./weight"

export const EX6 = definePlugin(kit.plugin({ actions: [PAGE_WEIGHT] }))

export default EX6

declare module "matomezu/catalog" {
  interface ActionTable {
    "ex6:page-weight": typeof PAGE_WEIGHT
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
