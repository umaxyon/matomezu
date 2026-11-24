// 郵便箱のボタン（ブックスクリーンのフッタの封筒）: 押すと郵便箱のスクリーンを下の段に開き、もう一度押すと閉じる。
// 角の未読の数は、利用者の設定 mailbox-unread の送り手で数える（AI と人の合計・AI から・人から）
import { useMessages } from "../../../ui/i18n"
import { useUserSetting } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { CornerCount } from "../left-side-panel/OpenButton"
import styles from "../utils/FooterButtons.module.css"
import { useMailbox, useMailboxScreen } from "./hooks"
import { unreadOf } from "./inbox"
import own from "./Mail.module.css"
import { MAILBOX_UNREAD, unreadChoiceOf } from "./unread-setting"

export function MailboxButton() {
  const t = useMessages(kit)
  const screen = useMailboxScreen()
  const unread = unreadOf(useMailbox(), unreadChoiceOf(useUserSetting(MAILBOX_UNREAD.id)))
  return (
    <button
      type="button"
      className={`${styles.item} ${own.envelope}`}
      aria-label={t("Mailbox")}
      title={t("Mailbox")}
      aria-pressed={screen.open}
      onClick={screen.toggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.5 6l8.5 7 8.5-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <CornerCount total={unread} />
    </button>
  )
}
