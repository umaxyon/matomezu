// 参加要求の見張り（ウィジェット join-request-watch。根に置き、何も描かない）: 要求中の参加者が増えたのを見たら、フォーカスのある窓か、
// 最後にフォーカスされた窓（常駐が知らせる）で、要求の題のマーキーを出す（読み込んだときからあった要求では出さない）
import { useEffect, useRef } from "react"
import { useReadState, useStoreActions } from "../../../ui/store-context"
import { kit } from "../kit"
import { useParticipants } from "./hooks"

export function JoinRequestWatch() {
  const participants = useParticipants()
  const { showToast } = useStoreActions()
  const read = useReadState()
  const before = useRef<Set<string> | null>(null)
  useEffect(() => {
    const requested = participants.filter(p => p.state === "requested")
    const came = before.current ? requested.filter(p => !before.current?.has(p.id)) : []
    before.current = new Set(requested.map(p => p.id))
    if (came.length > 0 && (document.hasFocus() || read().lastWindow))
      showToast({ kind: "info", form: "marquee", message: kit.message("A join request arrived from an AI agent") })
  }, [participants, showToast, read])
  return null
}
