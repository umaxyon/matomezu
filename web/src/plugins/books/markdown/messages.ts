// マークダウンのプラグインの文言（ブックのタイプの名前、ペインのタブ、ペインの分割のコマンド、ソースの Tab キーの設定の項目）
import { defineMessages } from "../../../plugin-api"

export const MARKDOWN_MESSAGES = defineMessages({
  Markdown: { en: "Markdown", ja: "マークダウン" },
  Source: { en: "Source", ja: "ソース" },
  Preview: { en: "Preview", ja: "プレビュー" },
  "Split vertically": { en: "Split vertically", ja: "縦分割" },
  "Split horizontally": { en: "Split horizontally", ja: "横分割" },
  "Close split": { en: "Close split", ja: "分割を閉じる" },
  "No pages": { en: "No pages", ja: "ページがありません" },
  "Create page": { en: "Create page", ja: "ページを作る" },
  Panes: { en: "Panes", ja: "ペイン" },
  "Tab key": { en: "Tab key", ja: "Tabキー" },
  "Number of spaces": { en: "Number of spaces", ja: "半角スペースの数" },
  Spaces: { en: "Spaces", ja: "半角スペース" },
  Tab: { en: "Tab", ja: "Tab" },
})
