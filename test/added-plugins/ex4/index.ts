// ex4: 2 つ目のつなぐもの（関係線）を持つ追加プラグイン。ビルトインの線と同じページで使う
import { definePlugin } from "matomezu"
import { kit } from "./kit"
import { MAP, RELATE, RELATION } from "./relation"

export const EX4 = definePlugin(kit.plugin({ bookTypes: [MAP], items: [RELATION], actions: [RELATE] }))

export default EX4

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex4:map": typeof MAP
  }
  interface ItemTable {
    "ex4:relation": typeof RELATION
  }
  interface ActionTable {
    "ex4:relate": typeof RELATE
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
