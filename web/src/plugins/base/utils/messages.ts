// 経った時間（「〜前」）と、選択肢から選ぶ設定の項目（ChoiceSetting）の文言
import { defineMessages } from "../../../core/i18n/messages"

export const ELAPSED_MESSAGES = defineMessages({
  "Just now": { en: "Just now", ja: "たった今" },
  "{n} min ago": { en: "{n} min ago", ja: "{n} 分前" },
  "{n} h ago": { en: "{n} h ago", ja: "{n} 時間前" },
  Yesterday: { en: "Yesterday", ja: "昨日" },
  "{n} days ago": { en: "{n} days ago", ja: "{n} 日前" },
  "{month}/{day}": { en: "{month}/{day}", ja: "{month}/{day}" },
  "{year}/{month}/{day}": { en: "{year}/{month}/{day}", ja: "{year}/{month}/{day}" },
})

export const CHOICE_SETTING_MESSAGES = defineMessages({
  "Inherit from book": { en: "Book", ja: "ブック継承" },
  "Inherit from book ({value})": { en: "Inherit from book ({value})", ja: "ブックを継承（{value}）" },
})
