// 経った時間（「〜前」）と、同じ名前で断られた原因と、一覧の行の「取消」（Withdraw.tsx）と、領域の最大化のボタン（MaxButton.tsx）の文言。
// utils の部品は、base の定義の関数の組（kit）を読まずに、文言だけの組 UTILS_TEXT で引く
import { defineMessages } from "../../../core/i18n/messages"
import { pluginMessages } from "../../../store/kit"
import { joinMessages } from "./join-messages"
import { BASE_ID } from "./plugin-id"

export const ELAPSED_MESSAGES = defineMessages({
  "Just now": { en: "Just now", ja: "たった今" },
  "The name is taken": { en: "The name is taken", ja: "同じ名前があります" },
  "{n} min ago": { en: "{n} min ago", ja: "{n} 分前" },
  "{n} h ago": { en: "{n} h ago", ja: "{n} 時間前" },
  Yesterday: { en: "Yesterday", ja: "昨日" },
  "{n} days ago": { en: "{n} days ago", ja: "{n} 日前" },
  "{month}/{day}": { en: "{month}/{day}", ja: "{month}/{day}" },
  "{year}/{month}/{day}": { en: "{year}/{month}/{day}", ja: "{year}/{month}/{day}" },
})

// 一覧の行の「取消」（Withdraw.tsx）
export const WITHDRAW_MESSAGES = defineMessages({
  "Withdraw?": { en: "Withdraw?", ja: "取り消しますか？" },
  Keep: { en: "Keep", ja: "やめる" },
  Withdraw: { en: "Withdraw", ja: "取消" },
  "Withdraw {name}": { en: "Withdraw {name}", ja: "{name}を取り消す" },
})

// 領域の最大化のボタン（MaxButton.tsx）
export const MAX_BUTTON_MESSAGES = defineMessages({
  "Maximize area": { en: "Maximize", ja: "最大化" },
  "Restore area": { en: "Restore size", ja: "元の大きさに戻す" },
})

export const UTILS_MESSAGES = joinMessages(ELAPSED_MESSAGES, WITHDRAW_MESSAGES, MAX_BUTTON_MESSAGES)
export const UTILS_TEXT = pluginMessages(BASE_ID, UTILS_MESSAGES)
