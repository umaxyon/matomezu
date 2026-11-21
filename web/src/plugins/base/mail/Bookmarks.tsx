// 郵便のしおり（ウィジェット mail-bookmarks。スロット bookmarks に置く）: まだ見ていない郵便を 1 通に 1 つずつ、しおりの置き場に渡す。
// 送り手の鳥の顔か封筒を描き、押すとその郵便のダイアログを開く。並べきれないときの「+n」は、ブックスクリーンをカレントスクリーンにして、左サイドパネルに郵便箱と送信トレイを渡して開く

import { useCallback, useMemo } from "react"
import { recentBookScreen } from "../../../core/window"
import { NO_STAGE } from "../../../store/dialogs"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState, useStoreActions } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { LETTER_ICON } from "../bookmarks/letter-icon"
import { type Bookmark, useShowBookmarks } from "../bookmarks/ui"
import { kit } from "../kit"
import { useOpenLeftSidePanelAt } from "../left-side-panel/hooks"
import { BirdFaceView } from "../participant/BirdFaceView"
import { useParticipants } from "../participant/hooks"
import { mailBookmarksOf } from "./bookmark-display"
import { mailboxEntries } from "./entries"
import { useMailbox, useOpenMail } from "./hooks"
import { shownOf } from "./shown"
import { MAILBOX_TAB_ID } from "./tab-id"

export function MailBookmarks() {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const mailbox = useMailbox()
  const participants = useParticipants()
  const stage = useMatomezuState(s => recentBookScreen(s.window)?.stages.current ?? NO_STAGE)
  const open = useOpenMail()
  const openPanel = useOpenLeftSidePanelAt()
  const actions = useStoreActions()
  const bookmarks = useMemo(
    (): Bookmark[] =>
      mailBookmarksOf(
        mailbox.filter(m => !m.seenAt),
        participants,
      ).map(({ mail, bird, tone, color, ink }) => ({
        key: mail.id,
        at: mail.sentAt,
        title: shownOf(catalog, mail, t)?.title ?? t("Mail"),
        face: bird ? <BirdFaceView bird={bird.bird} palette={bird.palette} size={18} /> : LETTER_ICON,
        tone,
        ...(color ? { color, ink } : {}),
        open: () => open(mail.id),
      })),
    [mailbox, participants, catalog, t, open],
  )
  const openRest = useCallback(() => {
    actions.showStage(stage)
    openPanel(stage, mailboxEntries, MAILBOX_TAB_ID)
  }, [actions, stage, openPanel])
  useShowBookmarks(bookmarks, openRest)
  return null
}
