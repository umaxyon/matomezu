// ツリーのプラグインの文言（ブックのタイプの名前、伸びる向きの設定、ページを作るダイアログ、ツリーのビュー）
import { defineMessages } from "../../../plugin-api"

export const TREE_MESSAGES = defineMessages({
  Tree: { en: "Tree", ja: "ツリー" },
  "Edit tool": { en: "Edit tool", ja: "編集ツール" },
  "Grow direction": { en: "Grow direction", ja: "伸びる向き" },
  Up: { en: "Up", ja: "上へ" },
  Down: { en: "Down", ja: "下へ" },
  Left: { en: "Left", ja: "左へ" },
  Right: { en: "Right", ja: "右へ" },
  Center: { en: "Center", ja: "中央から" },
  "Inherit from book": { en: "Book", ja: "ブック継承" },
  "Inherit from book ({direction})": { en: "Inherit from book ({direction})", ja: "ブックを継承（{direction}）" },
  "New page": { en: "New page", ja: "新しいページ" },
  "Page name": { en: "Page name", ja: "ページ名" },
  "Root caption": { en: "Root caption", ja: "根のキャプション" },
  Create: { en: "Create", ja: "作る" },
  Paper: { en: "Paper", ja: "紙" },
  "This paper cannot be shown": { en: "This paper cannot be shown", ja: "この紙は表示できません" },
  "Create page": { en: "Create page", ja: "ページを作る" },
  "No pages": { en: "No pages", ja: "ページがありません" },
  "Unknown paper": { en: "Unknown paper", ja: "不明な紙" },
})
