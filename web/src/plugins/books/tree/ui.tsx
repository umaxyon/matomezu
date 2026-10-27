// ツリーのプラグインの見た目: ツリーのビュー・伸びる向きの設定のコンポーネント・ページを作るダイアログ。
// 末尾で、ツリーのビューが開く右クリックのメニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../../plugin-api/ui"
import { TREE_PLUGIN } from "."
import { GrowSetting } from "./GrowSetting"
import { GROW } from "./grow"
import { NewTreePageDialog } from "./NewTreePageDialog"
import { NEW_TREE_PAGE_DIALOG, TREE_PRESENTATION } from "./tree"
import { TREE_VIEW } from "./view/ui"

export const TREE_UI = definePluginUi(TREE_PLUGIN, {
  presentationViews: { [TREE_PRESENTATION.id]: TREE_VIEW },
  settingViews: { [GROW.id]: { control: GrowSetting } },
  dialogViews: { [NEW_TREE_PAGE_DIALOG.id]: NewTreePageDialog },
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/tree:tree-context": Record<string, never> // 紙の画面（何も受け取らない）
  }
}
