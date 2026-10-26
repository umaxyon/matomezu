// ex5: 文字を持たず、中身の欄の名前が children でない形（タイル）を持つ追加プラグイン
import { definePlugin } from "matomezu"
import { kit } from "./kit"
import { SHELF, TILE_ADD, TILES } from "./tiles"

export const EX5 = definePlugin(kit.plugin({ bookTypes: [SHELF], items: [TILES], actions: [TILE_ADD] }))

export default EX5

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex5:shelf": typeof SHELF
  }
  interface ItemTable {
    "ex5:tiles": typeof TILES
  }
  interface ActionTable {
    "ex5:tile-add": typeof TILE_ADD
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
