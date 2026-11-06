// 郵便箱を読み、郵便を開く・アクションを行うフック
import { useCallback } from "react"
import type { Mailbox } from "../../../core/mail"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { MAIL_DIALOG } from "./dialogs"

// 利用者の郵便箱（届いた順）
export const useMailbox = (): Mailbox => useMatomezuState(s => s.mailbox)

// まだ見ていない郵便の数
export const useUnreadMail = (): number => useMatomezuState(s => s.mailbox.filter(m => !m.seenAt).length)

// ステージ stage で、郵便 id のダイアログを開く関数
export function useOpenMail(): (stage: string, id: string) => void {
  const { openDialog } = useActions()
  return useCallback((stage, id) => openDialog(stage, MAIL_DIALOG.id, { mail: id }), [openDialog])
}

// 郵便箱が対象のアクション id を、郵便 mail について行う関数（行えたか）
export function useMailAction(): (id: string, mail: string) => boolean {
  const { perform } = useActions()
  return useCallback(
    (id, mail) => (perform as (id: string, args: unknown) => { ok: boolean })(id, { mail }).ok,
    [perform],
  )
}
