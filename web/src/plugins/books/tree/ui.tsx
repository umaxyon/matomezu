// ツリーのプラグインの見た目: ツリーのビュー・伸びる向きと節の大きさの設定のコンポーネント・ページを作るダイアログ・節の大きさと色のダイアログ・編集の道具のアイコン。
// 末尾で、ツリーのビューが開く右クリックのメニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../../plugin-api/ui"
import { TREE_PLUGIN } from "."
import { GrowSetting } from "./GrowSetting"
import { GROW } from "./grow"
import { TREE_TOOL_ICONS } from "./icons"
import { NewTreePageDialog } from "./NewTreePageDialog"
import { NodeColorDialog } from "./NodeColorDialog"
import { NodeSizeDialog } from "./NodeSizeDialog"
import { NodeSizeSetting } from "./NodeSizeSetting"
import { NODE_SIZE } from "./size"
import { NEW_TREE_PAGE_DIALOG, NODE_COLOR_DIALOG, NODE_SIZE_DIALOG, TREE_PRESENTATION } from "./tree"
import { TREE_VIEW } from "./view/ui"

export const TREE_UI = definePluginUi(TREE_PLUGIN, {
  presentationViews: { [TREE_PRESENTATION.id]: TREE_VIEW },
  settingViews: { [GROW.id]: { control: GrowSetting }, [NODE_SIZE.id]: { control: NodeSizeSetting } },
  dialogViews: {
    [NEW_TREE_PAGE_DIALOG.id]: NewTreePageDialog,
    [NODE_SIZE_DIALOG.id]: NodeSizeDialog,
    [NODE_COLOR_DIALOG.id]: NodeColorDialog,
  },
  toolIcons: TREE_TOOL_ICONS,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/tree:tree-context": Record<string, never> // 紙の画面（何も受け取らない）
    "@matomezu/tree:node-context": Record<string, never> // 節（右クリックした節を選んでから開くので、何も受け取らない）
  }
}
