// 経った時間（「〜前」）と、選択肢から選ぶ設定の項目（ChoiceSetting）と、物の角に出す物（corner.tsx）の文言
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

export const CORNER_MESSAGES = defineMessages({
  Corner: { en: "Corner", ja: "角" },
  "Things at the corner": { en: "Things at the corner", ja: "角の物" },
  "Show the {n} things at the corner": { en: "Show the {n} things at the corner", ja: "角の {n} 件を見る" },
})
