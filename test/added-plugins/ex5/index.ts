// ex5: 文字を持たず、中身のフィールドの名前が children でない形（タイル）と、自分の道具と道具の組と、自分の許可の段（札の数の上限）を持つ追加プラグイン
import { definePlugin } from "matomezu"
import { kit } from "./kit"
import { SHELF, SHELF_TOOLS, SORT_TOOL, TILE_ADD, TILE_LIMIT_PERMISSION, TILES, TILES_TOKENS } from "./tiles"

export const EX5 = definePlugin(
  kit.plugin({
    bookTypes: [SHELF],
    items: [TILES],
    actions: [TILE_ADD],
    tools: [SORT_TOOL],
    toolSets: [SHELF_TOOLS],
    permissions: [TILE_LIMIT_PERMISSION],
    tokens: TILES_TOKENS,
  }),
)

export default EX5

declare module "matomezu/catalog" {
  interface CapabilityTable {
    "ex5:stackable": true // 札を積める（ex5 だけが読む能力の見本）
  }
  interface BookTypeTable {
    "ex5:shelf": typeof SHELF
  }
  interface ItemTable {
    "ex5:tiles": typeof TILES
  }
  interface ActionTable {
    "ex5:tile-add": typeof TILE_ADD
  }
  interface ToolTable {
    "ex5:sort": typeof SORT_TOOL
  }
  interface ToolSetTable {
    "ex5:shelf-tools": typeof SHELF_TOOLS
  }
  interface PermissionTable {
    "ex5:tile-limit": typeof TILE_LIMIT_PERMISSION
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
