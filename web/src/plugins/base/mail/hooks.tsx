// 郵便箱を読み、郵便を開くフック
import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { sameData } from "../../../core/same"
import { screenOf } from "../../../core/window"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useLeftSidePanel, useToggleLeftSidePanel } from "../left-side-panel/hooks"
import { mailboxOf } from "."
import { MAIL_DIALOG } from "./dialogs"
import { mailboxEntries } from "./entries"
import type { Mail } from "./mail"

// 利用者の郵便箱（郵便のレコードを届いた順に並べた物）
export const useMailbox = (): readonly Mail[] => useMatomezuState(useShallow(s => mailboxOf(s.records)))

// まだ見ていない郵便の数
export const useUnreadMail = (): number => useMailbox().filter(m => !m.seenAt).length

// 前に出せるブックスクリーンのカレントのステージで、郵便 id のダイアログを開く関数（前に出している物は替えない）
export function useOpenMail(): (id: string) => void {
  const { openDialog } = useActions()
  const read = useReadState()
  return useCallback(
    id => openDialog(screenOf(read().window).current, MAIL_DIALOG.id, { mail: id }),
    [openDialog, read],
  )
}

// 郵便箱の左サイドパネル（郵便箱と、ステージ stage の送信トレイとスクラップトレイ）を開閉する。open は、今その組を開いているか。
// 開く側のウィジェットは、MAILBOX_OPENS を opens に書く（郵便箱のタブの中身が開けるスロットを使うため）
// stage を渡さなければ（ステージを持たないスクリーンから開くとき）、送信トレイは、いちばん最近カレントにしたブックスクリーンのカレントのステージの物
export function useMailboxPanel(stage?: string): { open: boolean; toggle: () => void } {
  const panel = useLeftSidePanel()
  const toggle = useToggleLeftSidePanel()
  const recent = useMatomezuState(s => screenOf(s.window).current)
  const entries = mailboxEntries(stage ?? recent)
  return { open: !!panel && sameData(panel.entries, entries), toggle: () => toggle(entries) }
}
