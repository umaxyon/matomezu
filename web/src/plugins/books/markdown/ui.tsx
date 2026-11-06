// マークダウンのプラグインの見た目: ビューと、Tab キーの設定の項目のビューと、ペインの並べ方のコマンドのアイコン。末尾で、ビューが開く右クリックのメニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../../plugin-api/ui"
import { defineSettingsSection } from "../../base/ui"
import { MARKDOWN_PLUGIN } from "."
import { kit } from "./kit"
import { MARKDOWN_PRESENTATION } from "./markdown"
import { SOURCE_LOOK_SETTINGS } from "./source-look"
import { TAB_KEY } from "./tab-key"
import { PANE_LAYOUT_ICONS } from "./view/pane-icons"
import { TabKeySetting } from "./view/TabKeySetting"
import { MARKDOWN_VIEW } from "./view/ui"

// 設定画面の「マークダウン」の項目: Tab キーとソースのペインの見た目
export const MARKDOWN_SETTINGS_SECTION = defineSettingsSection({
  id: kit.name("settings"),
  title: kit.message("Markdown"),
  settings: [TAB_KEY.id, ...SOURCE_LOOK_SETTINGS.map(s => s.id)],
  place: { after: "@matomezu/base:settings-general" },
})

export const MARKDOWN_UI = definePluginUi(MARKDOWN_PLUGIN, {
  presentationViews: { [MARKDOWN_PRESENTATION.id]: MARKDOWN_VIEW },
  userSettingViews: { [TAB_KEY.id]: { control: TabKeySetting } },
  commandIcons: PANE_LAYOUT_ICONS,
  widgets: [MARKDOWN_SETTINGS_SECTION],
})

declare module "../../../core/catalog" {
  interface WidgetTable {
    "@matomezu/markdown:settings": typeof MARKDOWN_SETTINGS_SECTION
  }
  interface ContextMenuTable {
    "@matomezu/markdown:pane-context": Record<string, never> // ペインの見出しと上の行・プレビューのペイン（何も受け取らない）
  }
}
