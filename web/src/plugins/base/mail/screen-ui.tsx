// 郵便箱のスクリーンを描くウィジェット。郵便箱のスクリーンの定義（screen.ts の MAILBOX_SCREEN）の id と同じ名前のスロットに置く（選んだ郵便の下の行のスロット mail-actions を開く）
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { MailboxScreen } from "./MailboxScreen"
import { MAILBOX_SCREEN } from "./screen"
import { MAIL_ACTIONS } from "./slots"

export const MAILBOX_SCREEN_VIEW = defineWidget({
  id: kit.name("mailbox-screen-view"),
  slots: [MAILBOX_SCREEN.id],
  opens: [MAIL_ACTIONS],
  view: MailboxScreen,
})
