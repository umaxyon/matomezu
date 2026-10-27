// フローチャートのプラグインの文言（ブックのタイプの名前、流れの向きの設定、分岐から出る線のキャプションの候補、自動で整列とその確認のダイアログ）
import { defineMessages } from "../../../plugin-api"

export const FLOWCHART_MESSAGES = defineMessages({
  Flowchart: { en: "Flowchart", ja: "フローチャート" },
  "Flow direction": { en: "Flow direction", ja: "流れの向き" },
  Down: { en: "Down", ja: "下へ" },
  Right: { en: "Right", ja: "右へ" },
  "Inherit from book": { en: "Book", ja: "ブック継承" },
  "Inherit from book ({direction})": { en: "Inherit from book ({direction})", ja: "ブックを継承（{direction}）" },
  Yes: { en: "Yes", ja: "Yes" },
  No: { en: "No", ja: "No" },
  "Auto align": { en: "Auto align", ja: "自動で整列" },
  "Does not fit on the paper": { en: "Does not fit on the paper", ja: "紙に収まりません" },
  "Arrange the layout automatically?": {
    en: "Arrange the layout automatically?",
    ja: "レイアウトを自動で整えてもよいですか？",
  },
  "Fit {shapes} to the page and align": {
    en: "Fit {shapes} to the page and align",
    ja: "{shapes}をページに合わせて整列",
  },
  "List separator": { en: ", ", ja: "・" },
  Run: { en: "Run", ja: "実行" },
  Cancel: { en: "Cancel", ja: "キャンセル" },
})
