// マークダウンのプラグインの見た目: ビューと、Tab キーの設定の項目のビューと、ペインの並べ方のコマンドのアイコン。末尾で、ビューが開く右クリックのメニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../../plugin-api/ui"
import { SOFT_BREAK } from "../../base"
import { defineSettingsCategory } from "../../base/ui"
import { MARKDOWN_PLUGIN } from "."
import { MARKDOWN_ENTRY_ICON } from "./entry-icon"
import { kit } from "./kit"
import { MARKDOWN, MARKDOWN_PRESENTATION } from "./markdown"
import { SOURCE_LOOK_SETTINGS } from "./source-look"
import { TAB_KEY } from "./tab-key"
import { MarkdownIcon } from "./type-icon"
import { MARKDOWN_VIEW, PANE_LAYOUT_ICONS, TabKeySetting } from "./view/ui"

// 設定カテゴリ「マークダウン」: Tab キーとソースのペインの見た目と、描いた文書の段落の中の改行 1 つ（base の設定の項目）
export const MARKDOWN_SETTINGS_CATEGORY = defineSettingsCategory({
  id: kit.name("settings"),
  title: kit.message("Markdown"),
  settings: [TAB_KEY.id, ...SOURCE_LOOK_SETTINGS.map(s => s.id), SOFT_BREAK.id],
})

export const MARKDOWN_UI = definePluginUi(MARKDOWN_PLUGIN, {
  pageTypeIcons: { [MARKDOWN.id]: <MarkdownIcon /> },
  enumValueIcons: { [MARKDOWN_ENTRY_ICON.id]: <MarkdownIcon /> },
  presentationViews: { [MARKDOWN_PRESENTATION.id]: MARKDOWN_VIEW },
  userSettingViews: { [TAB_KEY.id]: { control: TabKeySetting } },
  commandIcons: PANE_LAYOUT_ICONS,
  widgets: [MARKDOWN_SETTINGS_CATEGORY],
})

declare module "../../../core/catalog" {
  interface WidgetTable {
    "@matomezu/markdown:settings": typeof MARKDOWN_SETTINGS_CATEGORY
  }
  interface ContextMenuTable {
    "@matomezu/markdown:pane-context": Record<string, never> // ペインの見出しと上の行・プレビューのペイン（何も受け取らない）
  }
}
