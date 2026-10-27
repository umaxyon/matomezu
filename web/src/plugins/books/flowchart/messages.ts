// フローチャートのプラグインの文言（ブックのタイプの名前、流れの向きの設定、分岐から出る線のキャプションの候補）
import { defineMessages } from "../../../plugin-api"

export const FLOWCHART_MESSAGES = defineMessages({
  Flowchart: { en: "Flowchart", ja: "フローチャート" },
  "Flow direction": { en: "Flow direction", ja: "流れの向き" },
  Down: { en: "Down", ja: "下へ" },
  Right: { en: "Right", ja: "右へ" },
  Yes: { en: "Yes", ja: "Yes" },
  No: { en: "No", ja: "No" },
})
