// 郵便の見張り（ウィジェット mail-watch。根に置き、何も描かない）:
// - 郵便が届いたのを見たら、フォーカスのある窓か、最後にフォーカスされた窓（常駐が知らせる）でマーキー「郵便が届きました: 題」を出す（読み込んだときからあった郵便では出さない）
// - 行き先のある、まだ行き先を見ていない郵便の行き先が、どれかのステージに出たら（そのブックのそのページを開き、物があればその物が表示領域に入ったら）、行き先を見たことにする
import { useEffect, useRef } from "react"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { anchorElementIn } from "../utils/anchors"
import { MAIL_VISITED } from "."
import { useMailbox } from "./hooks"
import { shownOf } from "./shown"

const CHECK_MS = 1000 // 行き先が出たかを見直す間隔

export function MailWatch() {
  const mailbox = useMailbox()
  const catalog = useCoreCatalog()
  const { showToast } = useActions()
  const read = useReadState()
  const before = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(mailbox.map(m => m.id))
    const came = before.current ? mailbox.filter(m => !before.current?.has(m.id) && !m.seenAt) : []
    before.current = ids
    const last = came.at(-1)
    if (last && (document.hasFocus() || read().lastWindow))
      showToast({
        kind: "info",
        form: "marquee",
        message: kit.message("Mail arrived: {title}"),
        params: { title: shownOf(catalog, last)?.title ?? "" },
      })
  }, [mailbox, catalog, showToast, read])
  useVisited()
  return null
}

// 行き先を見たかの見張り
function useVisited() {
  const read = useReadState()
  const { perform } = useActions()
  const waiting = useMatomezuState(s => s.mailbox.some(m => m.to && !m.visitedAt))
  useEffect(() => {
    if (!waiting) return
    const check = () => {
      const s = read()
      for (const m of s.mailbox) {
        const to = m.to
        if (!to || m.visitedAt) continue
        const shown = s.workspace.stages.some(st => {
          const o = st.opened
          if (!o || o.book !== to.book || (to.page && o.page !== to.page)) return false
          return !to.ids || to.ids.some(id => onScreen(st.id, id))
        })
        if (shown) perform(MAIL_VISITED.id, { mail: m.id })
      }
    }
    check()
    const timer = setInterval(check, CHECK_MS)
    return () => clearInterval(timer)
  }, [waiting, read, perform])
}

// ステージ stage で、物 id が表示領域に入っているか
function onScreen(stage: string, id: string): boolean {
  const found = anchorElementIn(stage, id)
  if (!found) return false
  const a = found.el.getBoundingClientRect()
  const v = found.view.getBoundingClientRect()
  return a.right > v.left && a.left < v.right && a.bottom > v.top && a.top < v.bottom
}
