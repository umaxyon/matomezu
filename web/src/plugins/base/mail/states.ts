// 郵便のプラグイン状態の宣言: 行き先を開いた郵便の行き先の物（鳥を連れてきている間だけ持つ）と、郵便箱の画面の選んでいる郵便・タブ
import { kit } from "../kit"
import type { MailSenderKind } from "./mail"

export interface BirdVisit {
  mail: string // 行き先を開いた郵便の id
  seq: number // 開いた回ごとに増える番号（同じ郵便をもう一度開いたら、鳥を連れてき直す）
  book: string
  page: string | null
  ids: readonly string[]
}

export const MAIL_BIRD_VISIT = kit.definePluginStateOf<BirdVisit>()({ id: "mail-bird-visit", scope: "stage" })

// 郵便箱の画面で選んでいる郵便の id（郵便箱の画面を描くスクリーン 1 枚ごと。読み直すと消える。値が無い・今のタブに無い・消えた郵便なら、選んでいないのと同じ）
export const MAILBOX_PICKED = kit.definePluginStateOf<string>()({ id: "mailbox-picked", scope: "screen" })

// 郵便箱の画面の受信トレイのタブ（送り手が AI か人か。スクリーン 1 枚ごと。読み直すと消える。値が無ければ AI）
export const MAILBOX_SENDER_TAB = kit.definePluginStateOf<MailSenderKind>()({
  id: "mailbox-sender-tab",
  scope: "screen",
  default: "ai",
})

export const MAIL_STATES = [MAIL_BIRD_VISIT, MAILBOX_PICKED, MAILBOX_SENDER_TAB] as const
