// しおり（ウィジェット mail-bookmarks。根に置く）: まだ見ていない郵便を、画面の上の右寄りから、しおりのようにぶら下げる（マーキーは消えるが、しおりは見るまで残る）。
// しおりは細く、郵便の絵だけを描く（題はボタンの名前）。3 通までは 1 通に 1 つずつ、色を変えて新しい順に並べ、押すとその郵便のダイアログを開く。3 通を超えたら 1 つにまとめて数を付け、押すと郵便箱（左サイドパネルの郵便箱のタブ）を開く
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { icon } from "../icon"
import { kit } from "../kit"
import { useOpenLeftSidePanel } from "../left-side-panel/hooks"
import { Tip } from "../utils/Tip"
import styles from "./Bookmarks.module.css"
import { useMailbox, useOpenMail } from "./hooks"
import { shownOf } from "./shown"
import { MAILBOX_TAB_ID } from "./tab-id"

const MAX_EACH = 3 // 1 通に 1 つずつぶら下げる、いちばん多い数

// 郵便の絵（封筒）
const LETTER_ICON = icon(
  <>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <path d="M3.5 7l8.5 6.5 8.5-6.5" />
  </>,
)

export function MailBookmarks() {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const unread = useMailbox().filter(m => !m.seenAt)
  const stage = useMatomezuState(s => s.workspace.current)
  const open = useOpenMail()
  const openPanel = useOpenLeftSidePanel()
  if (unread.length === 0) return null
  if (unread.length > MAX_EACH)
    return (
      <div className={styles.bookmarks}>
        <button
          type="button"
          className={styles.bookmark}
          data-tone={0}
          aria-label={t("{n} unread mail", { n: unread.length })}
          onClick={() => openPanel(stage, MAILBOX_TAB_ID)}
        >
          {LETTER_ICON}
          <span className={styles.count}>{unread.length}</span>
        </button>
      </div>
    )
  return (
    <div className={styles.bookmarks}>
      {[...unread].reverse().map((m, i) => (
        <Tip key={m.id} text={shownOf(catalog, m)?.title ?? t("Mail")}>
          <button
            type="button"
            className={styles.bookmark}
            data-tone={i}
            aria-label={shownOf(catalog, m)?.title ?? t("Mail")}
            onClick={() => open(stage, m.id)}
          >
            {LETTER_ICON}
          </button>
        </Tip>
      ))}
    </div>
  )
}
