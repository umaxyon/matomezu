// 届いた物のマーキー: 並び items に前に見なかった id の物が加わったら、フォーカスのある窓か、最後にフォーカスされた窓（常駐が知らせる）で、
// marquee が返す文のマーキーを出す（読み込んだときからあった物では出さない。marquee が NO_MARQUEE を返せば出さない）
import { useEffect, useRef } from "react"
import type { Toast } from "../../../store/state"
import { useReadState, useStoreActions } from "../../../ui/store-context"

// マーキーの文（文言と、差し込む値）
export type MarqueeText = Required<Pick<Toast, "message" | "params">>
// マーキーを出さないときに marquee が返す値
export const NO_MARQUEE = "none"

export function useArrivalMarquee<T extends { id: string }>(
  items: readonly T[],
  marquee: (came: readonly T[]) => MarqueeText | typeof NO_MARQUEE,
) {
  const { showToast } = useStoreActions()
  const read = useReadState()
  const before = useRef<ReadonlySet<string> | null>(null)
  const latest = useRef(marquee)
  latest.current = marquee
  useEffect(() => {
    const seen = before.current
    const came = seen ? items.filter(i => !seen.has(i.id)) : []
    before.current = new Set(items.map(i => i.id))
    if (came.length === 0 || !(document.hasFocus() || read().lastWindow)) return
    const text = latest.current(came)
    if (text !== NO_MARQUEE) showToast({ kind: "info", form: "marquee", ...text })
  }, [items, showToast, read])
}
