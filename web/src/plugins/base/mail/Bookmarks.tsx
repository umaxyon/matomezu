// しおり（ウィジェット mail-bookmarks。根に置く）: まだ見ていない郵便を、画面の上の右寄りから、しおりのようにぶら下げる（マーキーは消えるが、しおりは見るまで残る）。
// 3 通までは 1 通に 1 つずつ、色を変えて新しい順に並べ、押すとその郵便のダイアログを開く。3 通を超えたら 1 つにまとめて数を付け、押すと郵便箱（左サイドパネルの郵便箱のタブ）を開く
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useOpenLeftSidePanel } from "../left-side-panel/hooks"
import { clampChars } from "../text/text"
import styles from "./Bookmarks.module.css"
import { useMailbox, useOpenMail } from "./hooks"
import { shownOf } from "./shown"
import { MAILBOX_TAB_ID } from "./tab-id"

const MAX_EACH = 3 // 1 通に 1 つずつぶら下げる、いちばん多い数
const TITLE_CHARS = 10 // しおりに出す題の字数

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
          {t("Mail")}
          <span className={styles.count}>{unread.length}</span>
        </button>
      </div>
    )
  return (
    <div className={styles.bookmarks}>
      {[...unread].reverse().map((m, i) => (
        <button
          key={m.id}
          type="button"
          className={styles.bookmark}
          data-tone={i}
          title={shownOf(catalog, m)?.title}
          onClick={() => open(stage, m.id)}
        >
          {clampChars(shownOf(catalog, m)?.title ?? t("Mail"), TITLE_CHARS)}
        </button>
      ))}
    </div>
  )
}
