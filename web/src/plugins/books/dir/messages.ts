// ディレクトリ構成図のプラグインの文言（ブックのタイプの名前、道具、アクションとコマンド、ページを作るダイアログ、ビュー）
import { defineMessages } from "../../../plugin-api"

export const DIR_MESSAGES = defineMessages({
  Directory: { en: "Directory", ja: "ディレクトリ構成図" },
  Pencil: { en: "Pencil", ja: "鉛筆" },
  "Add entries": { en: "Add entries", ja: "中身を足す" },
  "Add paths": { en: "Add paths", ja: "パスから足す" },
  "Update entry": { en: "Update entry", ja: "中身を書き換える" },
  "Remove entry": { en: "Remove entry", ja: "中身を消す" },
  "Move entry": { en: "Move entry", ja: "中身を移す" },
  "Open or close folder": { en: "Open or close folder", ja: "フォルダを開閉" },
  "Sort folder": { en: "Sort folder", ja: "フォルダを並べ替える" },
  "Does not fit on the paper": { en: "Does not fit on the paper", ja: "紙に入りません" },
  Folder: { en: "Folder", ja: "フォルダ" },
  File: { en: "File", ja: "ファイル" },
  Open: { en: "Open", ja: "開く" },
  Close: { en: "Close", ja: "閉じる" },
  "New page": { en: "New page", ja: "新しいページ" },
  "Page name": { en: "Page name", ja: "ページ名" },
  "Root folder name": { en: "Root folder name", ja: "根のフォルダの名前" },
  Create: { en: "Create", ja: "作る" },
  Paper: { en: "Paper", ja: "紙" },
  "This paper cannot be shown": { en: "This paper cannot be shown", ja: "この紙は表示できません" },
  "Create page": { en: "Create page", ja: "ページを作る" },
  "No pages": { en: "No pages", ja: "ページがありません" },
  "Unknown paper": { en: "Unknown paper", ja: "不明な紙" },
})
