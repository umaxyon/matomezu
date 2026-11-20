// ticket の文言
import { defineMessages } from "../../../plugin-api"

export const TICKET_MESSAGES = defineMessages({
  ticket: { en: "Ticket", ja: "チケット" },
  closedProject: { en: "Closed project", ja: "閉じたプロジェクト" },
  "add ticket": { en: "Add a ticket", ja: "チケットを足す" },
  "update ticket": { en: "Change a ticket", ja: "チケットを直す" },
  "remove ticket": { en: "Remove a ticket", ja: "チケットを消す" },
  "lock ticket": { en: "Lock a ticket", ja: "チケットをロックする" },
  "unlock ticket": { en: "Unlock a ticket", ja: "チケットのロックを外す" },
  // 優先度と規模の段の名前（カード・チケットスクリーン・横断検索で使う）
  "priority lowest": { en: "lowest", ja: "最小" },
  "priority low": { en: "low", ja: "小" },
  "priority medium": { en: "medium", ja: "中" },
  "priority high": { en: "high", ja: "大" },
  "priority highest": { en: "highest", ja: "最大" },
  "volume none": { en: "none", ja: "未" },
  "volume xs": { en: "XS", ja: "XS" },
  "volume s": { en: "S", ja: "S" },
  "volume m": { en: "M", ja: "M" },
  "volume l": { en: "L", ja: "L" },
  "volume xl": { en: "XL", ja: "XL" },
})
