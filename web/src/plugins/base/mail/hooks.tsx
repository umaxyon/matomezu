// 郵便箱を読み、郵便を開くフック
import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { currentScreen, recentBookScreen, stageIn } from "../../../core/window"
import { NO_STAGE } from "../../../store/dialogs"
import { useStageId } from "../../../ui/scope"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { useLeftSidePanelShowsAt, useToggleLeftSidePanelAt } from "../left-side-panel/hooks"
import { useRequestReveal } from "../utils/reveal-request"
import { mailboxOf } from "."
import { useSetBirdVisitAt } from "./bird-visit"
import { MAIL_DIALOG } from "./dialogs"
import { mailboxEntries } from "./entries"
import type { Mail } from "./mail"

// 利用者の郵便箱（郵便のレコードを届いた順に並べた物）
export const useMailbox = (): readonly Mail[] => useMatomezuState(useShallow(s => mailboxOf(s.records)))

// まだ見ていない郵便の数
export const useUnreadMail = (): number => useMailbox().filter(m => !m.seenAt).length

// いちばん最近カレントにしたブックスクリーンのカレントのステージで（ブックスクリーンが無ければ、カレントスクリーンから、ステージを持たずに）、郵便 id のダイアログを開く関数（カレントスクリーンは替えない）
export function useOpenMail(): (id: string) => void {
  const { openDialog } = useStoreActions()
  const read = useReadState()
  return useCallback(
    id => {
      // ブックスクリーンが無ければ、カレントスクリーンから出す（ダイアログはステージを持たない）
      const win = read().window
      openDialog(recentBookScreen(win)?.stages.current ?? currentScreen(win).id, MAIL_DIALOG.id, { mail: id })
    },
    [openDialog, read],
  )
}

// 郵便箱の左サイドパネル（郵便箱と、送信トレイ）を開閉する。open は、今その組を開いているか。
// 開く側のウィジェットは、MAILBOX_OPENS を opens に書く（郵便箱のタブの中身が開けるスロットを使うため）
// 送信トレイは、描いている場所（ui/scope.tsx）のステージの物。ステージを持たないスクリーンから開くときは、いちばん最近カレントにしたブックスクリーンのカレントのステージの物
export function useMailboxPanel(): { open: boolean; toggle: () => void } {
  const toggle = useToggleLeftSidePanelAt()
  const here = useStageId()
  const recent = useMatomezuState(s => recentBookScreen(s.window)?.stages.current ?? NO_STAGE)
  const stage = here ?? recent
  const open = useLeftSidePanelShowsAt(stage, mailboxEntries)
  return { open, toggle: () => toggle(stage, mailboxEntries) }
}

let visits = 0 // 行き先を開いた回の番号（bird-visit.tsx の seq）

// ステージ target に、郵便 mail の行き先を開く関数: そのステージを見せ（行き先のブックがもう開いていても、ブックスクリーンをカレントスクリーンにする）、
// ブックとページを開き、行き先の物を見せて鳥を連れてくる。行き先の無い郵便なら何もしない
export function useShowMailPlaceAt(): (target: string, mail: Mail) => void {
  const actions = useStoreActions()
  const read = useReadState()
  const reveal = useRequestReveal()
  const bringBird = useSetBirdVisitAt()
  return useCallback(
    (target, mail) => {
      const to = mail.to
      if (!to) return
      actions.showStage(target)
      if (stageIn(read().window, target)?.opened?.book !== to.book) actions.openBook(target, to.book)
      if (to.page) actions.openPage(target, to.page)
      if (to.ids && to.ids.length > 0) {
        reveal(target, to.ids)
        bringBird(target, { mail: mail.id, seq: ++visits, book: to.book, page: to.page ?? null, ids: to.ids })
      }
    },
    [actions, read, reveal, bringBird],
  )
}

// 郵便 mail の行き先を開く関数: 描いている場所がステージなら、そのステージに開く。ステージでなければ、行き先のブックを窓に出して（showBook）、そこに開く
export function useShowMailPlace(): (mail: Mail) => void {
  const stage = useStageId()
  const show = useShowMailPlaceAt()
  const actions = useStoreActions()
  return useCallback(
    mail => {
      if (stage !== null) return show(stage, mail)
      if (!mail.to) return
      const shown = actions.showBookStage(mail.to.book)
      if (shown !== NO_STAGE) show(shown, mail)
    },
    [stage, show, actions],
  )
}
