// 参加要求のしおり（ウィジェット join-request-bookmarks。スロット bookmarks に置く）: 要求中の参加者を 1 人に 1 つずつ、しおりの置き場に渡す（郵便箱には出さない）。
// 封筒を描き、押すと参加要求のダイアログを開く。受け入れ・断り・キャンセルで要求中でなくなると消える
import { useMemo } from "react"
import { useMessages } from "../../../ui/i18n"
import { LETTER_ICON } from "../bookmarks/letter-icon"
import { type Bookmark, useShowBookmarks } from "../bookmarks/ui"
import { kit } from "../kit"
import { useOpenDialogInRecentStage } from "../utils/open-dialog-in-recent-stage"
import { JOIN_REQUEST_DIALOG } from "./dialogs"
import { useParticipants } from "./hooks"

export function JoinRequestBookmarks() {
  const t = useMessages(kit)
  const openDialog = useOpenDialogInRecentStage()
  const participants = useParticipants()
  const bookmarks = useMemo(
    (): Bookmark[] =>
      participants
        .filter(p => p.state === "requested")
        .map(p => ({
          key: p.id,
          at: p.requestedAt,
          title: t("A join request arrived from an AI agent"),
          face: LETTER_ICON,
          open: () => openDialog(JOIN_REQUEST_DIALOG.id, { participant: p.id }),
        })),
    [participants, t, openDialog],
  )
  useShowBookmarks(bookmarks)
  return null
}
