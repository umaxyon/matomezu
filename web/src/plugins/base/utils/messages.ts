// 経った時間（「〜前」）と、同じ名前で断られた原因と、一覧の行の「取消」（Withdraw.tsx）と、問いの吹き出し（Ask.tsx）と、物の角に出す物（corner.tsx）の文言
import { defineMessages } from "../../../core/i18n/messages"

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

// 問いの吹き出し（Ask.tsx）
export const ASK_MESSAGES = defineMessages({
  Yes: { en: "Yes", ja: "はい" },
})

export const CORNER_MESSAGES = defineMessages({
  Corner: { en: "Corner", ja: "角" },
  "Things at the corner": { en: "Things at the corner", ja: "角の物" },
  "Show the {n} things at the corner": { en: "Show the {n} things at the corner", ja: "角の {n} 件を見る" },
  "Corner status order": { en: "Corner status order", ja: "コーナーステータスの並び" },
})

// 領域の最大化のボタン（MaxButton.tsx）
export const MAX_BUTTON_MESSAGES = defineMessages({
  "Maximize area": { en: "Maximize", ja: "最大化" },
  "Restore area": { en: "Restore size", ja: "元の大きさに戻す" },
})
