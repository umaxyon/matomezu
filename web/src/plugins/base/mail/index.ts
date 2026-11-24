// 郵便: 送り手（AI など）から利用者へ届く物。郵便 1 通は対象の定義 mail のレコード 1 件で、届いた順は番号 order（mail.ts）。
// base の郵便の種類は手紙（letter。題と本文）。送るのは mail-send（AI も送れる）、見た・行き先を見た・消すは利用者だけ（on の record で郵便を指す）。
// 既読は 2 つ: 利用者が郵便を開いて見た時点 seenAt（画面の未読の数はこれで数える）と、郵便が示した物を見た時点 visitedAt（AI は read_records でこれを知る）

export { type LetterProps, MAIL_LETTER, MAIL_REMOVE, MAIL_SEEN, MAIL_SEND, MAIL_VISITED } from "./actions"
export { MAIL_PROPOSAL, PROPOSAL_APPLY, PROPOSAL_SEND, PROPOSAL_SETTLE } from "./proposal"
export { MAIL, MAILBOX_LIMIT, mailAdded, mailboxOf, READS_MAILBOX_KEYS } from "./subject"

import type {} from "./shown"

export {
  MAILBOX_KEY_SCOPE,
  MAILBOX_KEYS,
  MAILBOX_OPEN,
  MAILBOX_PICK_MOVE,
  MAILBOX_SCREEN,
  MAILBOX_SCREEN_CLOSE,
  MAILBOX_SCREEN_EXPAND,
} from "./screen"
export { type MAIL_BIRD_VISIT, MAIL_STATES, type MAILBOX_PICKED, type MAILBOX_SENDER_TAB } from "./states"
export { MAILBOX_UNREAD } from "./unread-setting"
