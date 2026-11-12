// ex9: アクションの対象の種類（対象の定義）を足す追加プラグイン。自分のレコード（カード）を、アクションが 1 件ずつ作る・直す・消す。番号は常駐が振る
import { definePlugin } from "matomezu"
import { CARD, CARD_ADD, CARD_REMOVE, CARD_RENAME } from "./cards"
import { kit } from "./kit"

export const EX9 = definePlugin(kit.plugin({ subjects: [CARD], actions: [CARD_ADD, CARD_RENAME, CARD_REMOVE] }))

export default EX9

declare module "matomezu/catalog" {
  interface SubjectTable {
    "ex9:card": typeof CARD
  }
  interface ActionTable {
    "ex9:card-add": typeof CARD_ADD
    "ex9:card-rename": typeof CARD_RENAME
    "ex9:card-remove": typeof CARD_REMOVE
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
