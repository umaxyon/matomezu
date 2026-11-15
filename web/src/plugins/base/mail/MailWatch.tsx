// 郵便の見張り（ウィジェット mail-watch。根に置き、何も描かない）:
// - 郵便が届いたのを見たら、フォーカスのある窓か、最後にフォーカスされた窓（常駐が知らせる）でマーキー「郵便が届きました: 題」を出す（読み込んだときからあった郵便では出さない）
// - 行き先のある、まだ行き先を見ていない郵便の行き先が、どれかのステージに出たら（そのブックのそのページを開き、物があればその物が表示領域に入ったら）、行き先を見たことにする
import { useEffect, useRef } from "react"
import { shownBookScreens } from "../../../core/window"
import { useT } from "../../../ui/i18n"
import { useReadState, useStoreActions } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { anchorElementIn } from "../utils/anchors"
import { MAIL_VISITED, mailboxOf } from "."
import { useMailbox } from "./hooks"
import { shownOf } from "./shown"
import { placeShown } from "./visited"

const CHECK_MS = 1000 // 行き先が出たかを見直す間隔

export function MailWatch() {
  const mailbox = useMailbox()
  const catalog = useCoreCatalog()
  const t = useT()
  const { showToast } = useStoreActions()
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
        params: { title: shownOf(catalog, last, t)?.title ?? "" },
      })
  }, [mailbox, catalog, t, showToast, read])
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
          .flatMap(st => (st.opened ? [{ id: st.id, book: st.opened.book, page: st.opened.page }] : []))
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
