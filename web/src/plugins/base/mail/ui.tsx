// 郵便の見た目のウィジェット: 郵便箱（左サイドパネルの最初のタブ）、しおりと見張り（根に置く）。郵便のダイアログ
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineLeftSidePanelTab } from "../left-side-panel/ui"
import { MailBookmarks } from "./Bookmarks"
import { MAIL_DIALOG } from "./dialogs"
import { useUnreadMail } from "./hooks"
import { MailboxView } from "./Mailbox"
import { MailDialog } from "./MailDialog"
import { MailWatch } from "./MailWatch"
import { MAILBOX_TAB_ID } from "./tab-id"

// 郵便箱のタブ（開くボタンとタブに、まだ見ていない郵便の数を出す）
export const MAILBOX_TAB = defineLeftSidePanelTab({
  id: MAILBOX_TAB_ID,
  title: kit.message("Mailbox"),
  useCount: useUnreadMail,
  view: MailboxView,
})

export const MAIL_BOOKMARKS = defineWidget({ id: kit.name("mail-bookmarks"), slots: ["root"], view: MailBookmarks })

export const MAIL_WATCH = defineWidget({ id: kit.name("mail-watch"), slots: ["root"], view: MailWatch })

export const MAIL_DIALOG_VIEWS = { [MAIL_DIALOG.id]: MailDialog }
