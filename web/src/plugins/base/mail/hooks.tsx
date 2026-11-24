// 郵便箱を読み、郵便箱のスクリーンを開け閉めし、郵便の行き先を開くフック

import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { openedEntry } from "../../../core/stage"
import { currentScreen, recentBookScreen, shownScreens, stageIn } from "../../../core/window"
import { NO_STAGE } from "../../../store/dialogs"
import { useStageId } from "../../../ui/scope"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { useRequestReveal } from "../stand/reveal-request"
import { viewInsideOf } from "../window/views-inside"
import { usePutViewInside } from "../window/views-inside-hooks"
import { mailboxOf } from "."
import { useSetBirdVisitAt } from "./bird-visit"
import type { Mail } from "./mail"
import { placeNow } from "./place"
import { MAILBOX_OPEN, MAILBOX_SCREEN, MAILBOX_SCREEN_CLOSE } from "./screen"

// 利用者の郵便箱（郵便のレコードを届いた順に並べた物）
export const useMailbox = (): readonly Mail[] => useMatomezuState(useShallow(s => mailboxOf(s.records)))

let visits = 0 // 行き先を開いた回の番号（bird-visit.tsx の seq）

// ステージ target に、郵便 mail の行き先（今の場所）を開く関数: そのステージを見せ（行き先のブックがもう開いていても、ブックスクリーンをカレントスクリーンにする）、
// ブックとページを開き、行き先の物を見せて鳥を連れてくる。行き先の無い郵便なら何もしない
export function useShowMailPlaceAt(): (target: string, mail: Mail) => void {
  const actions = useStoreActions()
  const read = useReadState()
  const reveal = useRequestReveal()
  const bringBird = useSetBirdVisitAt()
  return useCallback(
    (target, mail) => {
      const to = placeNow(mail, read().books)
      if (!to) return
      actions.showStage(target)
      if (openedEntry(stageIn(read().window, target)?.opened)?.id !== to.book) actions.openBook(target, to.book)
      if (to.page) actions.openPage(target, to.page)
      if (to.ids && to.ids.length > 0) {
        reveal(target, to.ids)
        bringBird(target, { mail: mail.id, seq: ++visits, book: to.book, page: to.page ?? null, ids: to.ids })
      }
    },
    [actions, read, reveal, bringBird],
  )
}

// 郵便箱を開く起点: 描いている場所のステージ here。ステージの外なら、カレントスクリーン current が郵便箱の画面を描いている（郵便箱のスクリーンか、
// 郵便箱の画面を中に描く inside）ならそのスクリーン、ほかは、いちばん最近カレントにしたブックスクリーンのカレントのステージ recent（無ければカレントスクリーン）
export function mailboxFromOf(
  here: string,
  current: { id: string; def: string },
  inside: boolean,
  recent: string,
): string {
  if (here !== NO_STAGE) return here
  if (inside || current.def === MAILBOX_SCREEN.id) return current.id
  return recent !== NO_STAGE ? recent : current.id
}

function useMailboxFrom(): { at: string; def: string } {
  const here = useStageId()
  const catalog = useCoreCatalog()
  const current = useMatomezuState(s => currentScreen(s.window))
  const recent = useMatomezuState(s => recentBookScreen(s.window)?.stages.current ?? NO_STAGE)
  const inside = viewInsideOf(catalog, current.def, MAILBOX_SCREEN.id) !== undefined
  return { at: mailboxFromOf(here, current, inside, recent), def: current.def }
}

// 郵便箱のスクリーンを開け閉めし、郵便を選んで開く（しおり・フッタの郵便箱のボタン・コントロールセンターの郵便箱のタイル）。open は、郵便箱のスクリーンが見えているか。
// 開くのは MAILBOX_OPEN（起点は useMailboxFrom）。起点のスクリーンが郵便箱の画面を中に描いていれば（定義の viewsInside）、それを出す値も入れる
export function useMailboxScreen(): { open: boolean; toggle: () => void; show: (mail?: string) => void } {
  const catalog = useCoreCatalog()
  const actions = useStoreActions()
  const putInside = usePutViewInside(MAILBOX_SCREEN.id)
  const from = useMailboxFrom()
  const screen = useMatomezuState(s => {
    const opened = s.window.screens.find(x => x.def === MAILBOX_SCREEN.id)?.id
    return opened !== undefined && shownScreens(catalog, s.window).includes(opened) ? opened : undefined
  })
  const { at, def } = from
  const show = useCallback(
    (mail?: string) => {
      putInside(def)
      actions.command(at, MAILBOX_OPEN.id, mail === undefined ? {} : { mail })
    },
    [actions, putInside, at, def],
  )
  const toggle = useCallback(() => {
    if (screen !== undefined) actions.command(screen, MAILBOX_SCREEN_CLOSE.id)
    else show()
  }, [actions, screen, show])
  return { open: screen !== undefined, toggle, show }
}
