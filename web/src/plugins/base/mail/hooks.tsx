// 郵便箱を読み、郵便箱のスクリーンを開け閉めし、郵便の行き先を開くフック

import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { openedEntry } from "../../../core/stage"
import { currentScreen, recentBookScreen, shownScreens, stageIn } from "../../../core/window"
import { NO_STAGE } from "../../../store/dialogs"
import { useSetPluginStateById } from "../../../ui/plugin-state-hooks"
import { useStageId } from "../../../ui/scope"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { useRequestReveal } from "../stand/reveal-request"
import { mailboxOf } from "."
import { useSetBirdVisitAt } from "./bird-visit"
import type { Mail } from "./mail"
import { GONE, type MailPlace, mailPlace } from "./place"
import { MAILBOX_OPEN, MAILBOX_SCREEN, MAILBOX_SCREEN_CLOSE } from "./screen"

// 利用者の郵便箱（郵便のレコードを届いた順に並べた物）
export const useMailbox = (): readonly Mail[] => useMatomezuState(useShallow(s => mailboxOf(s.records)))

let visits = 0 // 行き先を開いた回の番号（bird-visit.tsx の seq）

// 郵便 mail の行き先の今の場所（mailPlace。今は無ければ、郵便が言う場所のまま）
const placeNow = (mail: Mail, books: Parameters<typeof mailPlace>[1]): MailPlace | undefined => {
  const place = mailPlace(mail, books)
  return place === GONE ? mail.to : (place ?? undefined)
}

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

// 郵便箱を開く起点: 描いている場所のステージ。ステージの外なら、カレントスクリーンが郵便箱の画面を描いている（郵便箱のスクリーンか、定義に mailboxArea を書いた）ならそのスクリーン、
// ほかは、いちばん最近カレントにしたブックスクリーンのカレントのステージ（無ければカレントスクリーン）
function useMailboxFrom(): { at: string; area: { state: string; value: unknown } | undefined; def: string } {
  const here = useStageId()
  const catalog = useCoreCatalog()
  const current = useMatomezuState(s => currentScreen(s.window))
  const recent = useMatomezuState(s => recentBookScreen(s.window)?.stages.current ?? NO_STAGE)
  const area = catalog.screens.get(current.def)?.mailboxArea
  if (here !== NO_STAGE) return { at: here, area: undefined, def: current.def }
  if (area !== undefined || current.def === MAILBOX_SCREEN.id) return { at: current.id, area, def: current.def }
  return { at: recent !== NO_STAGE ? recent : current.id, area: undefined, def: current.def }
}

// 郵便箱のスクリーンを開け閉めし、郵便を選んで開く（しおり・フッタの郵便箱のボタン・コントロールセンターの郵便箱のタイル）。open は、郵便箱のスクリーンが見えているか。
// 開くのは MAILBOX_OPEN（起点は useMailboxFrom）。起点のスクリーンの定義が mailboxArea を書いていれば、そのスクリーンの郵便箱の画面を出す値も入れる
export function useMailboxScreen(): { open: boolean; toggle: () => void; show: (mail?: string) => void } {
  const catalog = useCoreCatalog()
  const actions = useStoreActions()
  const setById = useSetPluginStateById()
  const from = useMailboxFrom()
  const screen = useMatomezuState(s => {
    const opened = s.window.screens.find(x => x.def === MAILBOX_SCREEN.id)?.id
    return opened !== undefined && shownScreens(catalog, s.window).includes(opened) ? opened : undefined
  })
  const { at, area, def } = from
  const show = useCallback(
    (mail?: string) => {
      if (area) setById(area.state, area.value, { screenDef: def })
      actions.command(at, MAILBOX_OPEN.id, mail === undefined ? {} : { mail })
    },
    [actions, setById, at, area, def],
  )
  const toggle = useCallback(() => {
    if (screen !== undefined) actions.command(screen, MAILBOX_SCREEN_CLOSE.id)
    else show()
  }, [actions, screen, show])
  return { open: screen !== undefined, toggle, show }
}
