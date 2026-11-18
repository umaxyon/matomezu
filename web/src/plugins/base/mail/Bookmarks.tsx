// しおり（ウィジェット mail-bookmarks。根に置く）: まだ見ていない郵便を、画面の上の右寄りから、しおりのようにぶら下げる（マーキーは消えるが、しおりは見るまで残る）。
// 3 通までは 1 通に 1 つずつ、送り手の鳥の顔か封筒を描く。押すとその郵便のダイアログを開く。
// 3 通を超えたら 1 つにまとめて数を付け、押すとブックスクリーンを前に出して、左サイドパネルに郵便箱と送信トレイを渡して開く。

import type { CSSProperties } from "react"
import { isLight } from "../../../core/color"
import { screenOf } from "../../../core/window"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState, useStoreActions } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { birdColors } from "../birds/colors"
import { icon } from "../icon"
import { kit } from "../kit"
import { useOpenLeftSidePanelAt } from "../left-side-panel/hooks"
import { BirdFaceView } from "../participant/BirdFaceView"
import { useParticipants } from "../participant/hooks"
import { Tip } from "../utils/Tip"
import styles from "./Bookmarks.module.css"
import { mailboxEntries } from "./entries"
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
  const participants = useParticipants()
  const stage = useMatomezuState(s => screenOf(s.window).current)
  const open = useOpenMail()
  const openPanel = useOpenLeftSidePanelAt()
  const actions = useStoreActions()
  if (unread.length === 0) return null
  if (unread.length > MAX_EACH)
    return (
      <div className={styles.bookmarks}>
        <button
          type="button"
          className={styles.bookmark}
          data-tone={0}
          aria-label={t("{n} unread mail", { n: unread.length })}
          onClick={() => {
            actions.showStage(stage)
            openPanel(stage, mailboxEntries, MAILBOX_TAB_ID)
          }}
        >
          {LETTER_ICON}
          <span className={styles.count}>{unread.length}</span>
        </button>
      </div>
    )
  return (
    <div className={styles.bookmarks}>
      {unread.reverse().map(m => {
        const title = shownOf(catalog, m, t)?.title ?? t("Mail")
        const sender = m.sender
        const joined = sender && participants.some(p => p.id === sender.participant && p.state === "joined")
        const color = sender ? birdColors(sender.bird, sender.palette)?.flag : undefined
        return (
          <Tip key={m.id} text={title}>
            <button
              type="button"
              className={styles.bookmark}
              data-tone={Number.isSafeInteger(m.order) ? (m.order - 1) % MAX_EACH : 0}
              style={
                color
                  ? ({
                      "--bookmark-tone": color,
                      "--bookmark-ink": isLight(color) ? "black" : "white",
                    } as CSSProperties)
                  : undefined
              }
              aria-label={title}
              onClick={() => open(m.id)}
            >
              {joined ? <BirdFaceView bird={sender.bird} palette={sender.palette} size={18} /> : LETTER_ICON}
            </button>
          </Tip>
        )
      })}
    </div>
  )
}
