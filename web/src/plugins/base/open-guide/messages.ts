// 常駐が知らないブラウザに出す、開き方の案内の文言
import { defineMessages } from "../../../core/i18n/messages"

export const OPEN_GUIDE_MESSAGES = defineMessages({
  "How to open matomezu": { en: "How to open matomezu", ja: "matomezu の開き方" },
  "Ask your AI to “run {command}”, or run it in a terminal": {
    en: "Ask your AI to “run {command}”, or run it in a terminal",
    ja: "AI に「{command} を実行して」と頼むか、ターミナルで実行してください",
  },
  Copy: { en: "Copy", ja: "コピー" },
  Copied: { en: "Copied", ja: "コピーしました" },
  "Could not copy": { en: "Could not copy", ja: "コピーできません" },
})
