// 受信トレイ（郵便箱のスクリーンの左の、届いた郵便の一覧）の純粋な計算: タブ（送り手が AI か人か）の行の並び、未読の数、↑↓で移した先の行
import { NO_STATE } from "../../../core/def/plugin-state"
import type { Mail, MailSenderKind } from "./mail"

// 未読の数を数える送り手: AI と人の合計（all）か、どちらかだけ
export type UnreadOf = MailSenderKind | "all"

// 郵便箱 mailbox（届いた順）のうち、送り手の種類が tab の郵便を新しい順に
export const inboxOf = (mailbox: readonly Mail[], tab: MailSenderKind): readonly Mail[] =>
  mailbox.filter(m => m.senderKind === tab).reverse()

// 郵便箱 mailbox の、まだ見ていない郵便のうち、送り手が of の物の数
export const unreadOf = (mailbox: readonly Mail[], of: UnreadOf): number =>
  mailbox.filter(m => !m.seenAt && (of === "all" || m.senderKind === of)).length

type Picked = string | typeof NO_STATE

// 並び rows の中で、選んでいる行 picked（選んでいなければ、並びに無い郵便でも NO_STATE と同じ）から to の向きに 1 つ移した行の id
// （選んでいなければ、下なら先頭・上なら末尾。端では動かない。行が無ければ NO_STATE）
export function pickMoved(rows: readonly Pick<Mail, "id">[], picked: Picked, to: "up" | "down"): Picked {
  const at = picked === NO_STATE ? -1 : rows.findIndex(m => m.id === picked)
  const next =
    at < 0
      ? to === "down"
        ? 0
        : rows.length - 1
      : Math.min(rows.length - 1, Math.max(0, at + (to === "down" ? 1 : -1)))
  return rows[next]?.id ?? NO_STATE
}

export const INBOX_ROWS = 30 // 受信トレイに一度に出す行の数

// 受信トレイで利用者が選んだ範囲: from は出す最初の行の番号、anchor はそのとき選んでいた郵便（選んでいなければ NO_STATE）
export interface InboxShown {
  from: number
  anchor: Picked
}
export const FIRST_SHOWN: InboxShown = { from: 0, anchor: NO_STATE }

// 並び rows のうち出す範囲の最初の行の番号（INBOX_ROWS の倍数）: 利用者が選んだ範囲 shown。
// ただし、選んでいる郵便 picked が範囲を選んだときの物と違い（しおり・行の移動などで選んだ）、範囲の外なら、その郵便を含む範囲。行が減って範囲が空になれば、最後の範囲
export function inboxFrom(rows: readonly Pick<Mail, "id">[], picked: Picked, shown: InboxShown): number {
  const at = picked === NO_STATE ? -1 : rows.findIndex(m => m.id === picked)
  const inShown = at >= shown.from && at < shown.from + INBOX_ROWS
  if (at >= 0 && picked !== shown.anchor && !inShown) return at - (at % INBOX_ROWS)
  const last = Math.max(0, rows.length - 1)
  return Math.min(shown.from, last - (last % INBOX_ROWS))
}
