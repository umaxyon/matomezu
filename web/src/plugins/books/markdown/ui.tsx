// マークダウンのプラグインの見た目: ビュー。末尾で、ビューが開く右クリックのメニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../../plugin-api/ui"
import { MARKDOWN_PLUGIN } from "."
import { MARKDOWN_PRESENTATION } from "./markdown"
import type { Pane } from "./panes"
import { MARKDOWN_VIEW } from "./view/ui"

export const MARKDOWN_UI = definePluginUi(MARKDOWN_PLUGIN, {
  presentationViews: { [MARKDOWN_PRESENTATION.id]: MARKDOWN_VIEW },
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/markdown:pane-context": { pane: Pane } // ペインのタブ（右クリックしたペイン）
  }
}
