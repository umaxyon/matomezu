// 郵便箱を読み、郵便を開くフック
import { useCallback } from "react"
import type { Mailbox } from "../../../core/mail"
import { screenOf } from "../../../core/window"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { MAIL_DIALOG } from "./dialogs"

// 利用者の郵便箱（届いた順）
export const useMailbox = (): Mailbox => useMatomezuState(s => s.mailbox)

// まだ見ていない郵便の数
export const useUnreadMail = (): number => useMatomezuState(s => s.mailbox.filter(m => !m.seenAt).length)

// 前に出せるブックスクリーンのカレントのステージで、郵便 id のダイアログを開く関数（前に出している物は替えない）
export function useOpenMail(): (id: string) => void {
  const { openDialog } = useActions()
  const read = useReadState()
  return useCallback(
    id => openDialog(screenOf(read().window).current, MAIL_DIALOG.id, { mail: id }),
    [openDialog, read],
  )
}
