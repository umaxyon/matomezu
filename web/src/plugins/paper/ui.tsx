// 紙のプラグインの見た目: 紙のビューと付け替えの道具のアイコン。末尾で、紙のビューが開く右クリックのメニューを機能台帳の型の側に書き足す
import { definePluginUi } from "../../plugin-api/ui"
import { PAPER_PLUGIN } from "."
import { PAPER } from "./paper"
import { PAPER_TOOL_ICONS } from "./tools/ui"
import { PAPER_VIEW } from "./view/ui"

export const PAPER_UI = definePluginUi(PAPER_PLUGIN, {
  presentationViews: { [PAPER.id]: PAPER_VIEW },
  toolIcons: PAPER_TOOL_ICONS,
})

declare module "../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/paper:paper-context": Record<string, never> // 紙の画面（何も受け取らない）
    "@matomezu/paper:item-context": { item: string } // 置いたアイテム（右クリックしたアイテムの id）
  }
}
