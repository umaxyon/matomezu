// 紙のプラグインの見た目: 紙のビューと付け替えの道具のアイコン。末尾で、紙のビューが開く右クリックのメニューを core/catalog.ts に書き足す
import type { Point } from "../../plugin-api"
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
    "@matomezu/paper:paper-context": { pointer?: Point } // 紙の画面（右クリックした所。表示領域の左上から）
    "@matomezu/paper:item-context": { item: string } // 置いたアイテム（右クリックしたアイテムの id）
  }
}
