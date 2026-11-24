// 郵便のしおり（ウィジェット mail-bookmarks。スロット bookmarks に置く）: まだ見ていない郵便を 1 通に 1 つずつ、しおりの置き場に渡す。
// 送り手の鳥の顔か封筒を描き、押すと郵便箱のスクリーンを開いてその郵便を選ぶ（コントロールセンターを見ていれば、その郵便箱の画面で選ぶ）。並べきれないときの「+n」は、郵便箱のスクリーンを開くだけ

import { useCallback, useMemo } from "react"
import { useMessages } from "../../../ui/i18n"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { LETTER_ICON } from "../bookmarks/letter-icon"
import { type Bookmark, useShowBookmarks } from "../bookmarks/ui"
import { kit } from "../kit"
import { BirdFaceView } from "../participant/BirdFaceView"
import { useParticipants } from "../participant/hooks"
import { mailBookmarksOf } from "./bookmark-display"
import { useMailbox, useMailboxScreen } from "./hooks"
import { shownOf } from "./shown"

export function MailBookmarks() {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const mailbox = useMailbox()
  const participants = useParticipants()
  const { show } = useMailboxScreen()
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
        open: () => show(mail.id),
      })),
    [mailbox, participants, catalog, t, show],
  )
  const openRest = useCallback(() => show(), [show])
  useShowBookmarks(bookmarks, openRest)
  return null
}
