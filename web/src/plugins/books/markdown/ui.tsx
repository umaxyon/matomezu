// マークダウンのプラグインの見た目: ビューと、Tab キーの設定の項目のビューと、ペインの並べ方のコマンドのアイコン。末尾で、ビューが開く右クリックのメニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../../plugin-api/ui"
import { MARKDOWN_PLUGIN } from "."
import { MARKDOWN_PRESENTATION } from "./markdown"
import { TAB_KEY } from "./tab-key"
import { PANE_LAYOUT_ICONS } from "./view/pane-icons"
import { TabKeySetting } from "./view/TabKeySetting"
import { MARKDOWN_VIEW } from "./view/ui"

export const MARKDOWN_UI = definePluginUi(MARKDOWN_PLUGIN, {
  presentationViews: { [MARKDOWN_PRESENTATION.id]: MARKDOWN_VIEW },
  userSettingViews: { [TAB_KEY.id]: { control: TabKeySetting } },
  commandIcons: PANE_LAYOUT_ICONS,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/markdown:pane-context": Record<string, never> // ペインの見出しと上の行・プレビューのペイン（何も受け取らない）
  }
}
