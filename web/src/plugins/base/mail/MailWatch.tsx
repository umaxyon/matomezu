// 郵便の見張り（ウィジェット mail-watch。根に置き、何も描かない）:
// - まだ見ていない郵便が届いたら、マーキー「郵便が届きました: 題」を出す（届いた物のマーキー）
// - 行き先のある、まだ行き先を見ていない郵便の行き先が、どれかのステージに出たら（そのブックのそのページを開き、物があればその物が表示領域に入ったら）、行き先を見たことにする

import { useEffect } from "react"
import { NOTHING_OPENED, shownPageId } from "../../../core/stage"
import { shownBookScreens } from "../../../core/window"
import { useT } from "../../../ui/i18n"
import { useReadState, useStoreActions } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { anchorElementIn } from "../stand/anchors"
import { NO_MARQUEE, useArrivalMarquee } from "../utils/arrival-marquee"
import { MAIL_VISITED, mailboxOf } from "."
import { useMailbox } from "./hooks"
import { shownOf } from "./shown"
import { placeShown } from "./visited"

const CHECK_MS = 1000 // 行き先が出たかを見直す間隔

export function MailWatch() {
  const catalog = useCoreCatalog()
  const t = useT()
  useArrivalMarquee(useMailbox(), came => {
    const last = came.filter(m => !m.seenAt).at(-1)
    return last
      ? { message: kit.message("Mail arrived: {title}"), params: { title: shownOf(catalog, last, t)?.title ?? "" } }
      : NO_MARQUEE
  })
  useVisited()
  return null
}

// 行き先を見たかの見張り
function useVisited() {
  const read = useReadState()
  const catalog = useCoreCatalog()
  const { perform } = useStoreActions()
  const waiting = useMailbox().some(m => m.to && !m.visitedAt)
  useEffect(() => {
    if (!waiting) return
    const check = () => {
      const s = read()
      // 見えていないブックスクリーンの行き先は、見たことにしない
      const shown = shownBookScreens(catalog, s.window)
      if (shown.length === 0) return
      for (const m of mailboxOf(s.records)) {
        if (!m.to || m.visitedAt) continue
        const stages = shown
          .flatMap(x => x.stages.stages)
          .flatMap(st => {
            if (st.opened === NOTHING_OPENED) return []
            return [{ id: st.id, book: st.opened.outermost.id, page: shownPageId(st.opened) }]
          })
        if (placeShown(m, stages, onScreen)) perform(MAIL_VISITED.id, {}, { record: m.id })
      }
    }
    check()
    const timer = setInterval(check, CHECK_MS)
    return () => clearInterval(timer)
  }, [waiting, read, perform, catalog])
}

// ステージ stage で、物 id が表示領域に入っているか
function onScreen(stage: string, id: string): boolean {
  const found = anchorElementIn(stage, id)
  if (!found) return false
  const a = found.el.getBoundingClientRect()
  const v = found.view.getBoundingClientRect()
  return a.right > v.left && a.left < v.right && a.bottom > v.top && a.top < v.bottom
}
