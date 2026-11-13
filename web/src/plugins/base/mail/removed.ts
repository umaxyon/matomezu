// 郵便が消えたときの AI 編集チケットの直し: 郵便の種類の定義に、base が拡張ポイントで書き足すメソッド ticketOnRemoved。
// 郵便を消すアクション（上限で古い郵便を消す mailAdded と、利用者が消す mail-remove）が、消す郵便ごとに種類に聞いて集める

import type { CoreCatalog } from "../../../core/core-catalog"
import type { AIEditTicketChange, AIEditTicketRemovedCause } from "../../../core/def/action"
import type { Mail } from "./mail"

declare module "../../../core/catalog" {
  interface MailExtras {
    // 郵便 mail が消えるとき（cause は消えたわけ: 郵便箱の上限で消えた limit か、利用者が消した user）の、AI 編集チケットの変え方。無ければ直さない
    ticketOnRemoved?(mail: Mail, cause: AIEditTicketRemovedCause): AIEditTicketChange | undefined
  }
}

// 消える郵便 mails の、種類が答えた AI 編集チケットの変え方の並び（消す順）
export const ticketsOnRemoved = (
  catalog: CoreCatalog,
  mails: readonly Mail[],
  cause: AIEditTicketRemovedCause,
): AIEditTicketChange[] =>
  mails.flatMap(m => {
    const change = catalog.mails.get(m.mail)?.ticketOnRemoved?.(m, cause)
    return change ? [change] : []
  })
