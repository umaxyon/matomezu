// ディレクトリ構成図のプラグインの見た目: ビュー・ページを作るダイアログ・中身の設定のダイアログ・鉛筆の道具のアイコン。
// 末尾で、ビューが開く右クリックのメニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../../plugin-api/ui"
import { DIR_PLUGIN } from "."
import { DIR_PRESENTATION, ENTRY_SETTINGS_DIALOG, NEW_DIR_PAGE_DIALOG } from "./dir"
import { EntrySettingsDialog } from "./EntrySettingsDialog"
import { DIR_TOOL_ICONS } from "./icons"
import { NewDirPageDialog } from "./NewDirPageDialog"
import { DIR_VIEW } from "./view/ui"

export const DIR_UI = definePluginUi(DIR_PLUGIN, {
  presentationViews: { [DIR_PRESENTATION.id]: DIR_VIEW },
  dialogViews: { [NEW_DIR_PAGE_DIALOG.id]: NewDirPageDialog, [ENTRY_SETTINGS_DIALOG.id]: EntrySettingsDialog },
  toolIcons: DIR_TOOL_ICONS,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/dir:dir-context": Record<string, never> // 紙の画面（何も受け取らない）
    "@matomezu/dir:entry-context": Record<string, never> // 行（右クリックした行を選んでから開くので、何も受け取らない）
  }
}
