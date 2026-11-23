// ブック（ワーカーブックなど）を開く物の押し方: クリックで「開く／分割で開く」の吹き出し、ダブルクリックで全画面で開く。
// 窓が低くて分けられないときは、吹き出しを出さず、クリックでも全画面で開く（チケットスクリーンのリンクと同じ）。ただしクリックで行う事 onClick が
// ある物（書庫の行を選ぶなど）は、低い窓ではクリックはそれだけにし、ダブルクリックで開く。
// 返す onClick を押す物に付け、bubble を描く。全画面で開く動き full は差し替えられる（書庫は書庫のコマンドで開く）
import { type MouseEvent, type ReactNode, useCallback, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { belowOf, ChoiceBubble } from "../utils/ChoiceBubble"
import { type Clicked, useClickOrDouble } from "../utils/useClickOrDouble"
import { useShowBook } from "./useShowBook"

export interface BookOpenChoiceOptions {
  book: string
  page?: string // 開くページ（無ければ、ブックスクリーンが決める）
  keepHere?: boolean // 分けた並びの中から分割で開くとき、起点を残してもう片方の段を替えるか（チケットスクリーン）
  full?: () => void // 全画面で開く動き（無ければ、ブックを窓に出す）
  onClick?: () => void // クリックで、すぐに行う事（書庫の選ぶなど。ダブルクリックの 2 回目では行わない）
}

export function useBookOpenChoice(o: BookOpenChoiceOptions): {
  onClick: (e: MouseEvent<HTMLElement>) => void
  bubble: ReactNode
} {
  const t = useMessages(kit)
  const shower = useShowBook(o.keepHere)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const close = useCallback(() => setAt(null), [])
  const full = o.full ?? (() => shower.full(o.book, o.page))
  const click = useClickOrDouble(
    (c: Clicked) => setAt(c.at ?? belowOf(c.el)),
    () => full(),
  )
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.detail <= 1) o.onClick?.()
    if (shower.tall) return click(e)
    // 低い窓では吹き出しを出さないので、クリックとダブルクリックを見分けず、待たない
    if (o.onClick === undefined ? e.detail <= 1 : e.detail === 2) full()
  }
  const bubble = at ? (
    <ChoiceBubble
      at={at}
      onClose={close}
      choices={[
        { label: t("Open book"), onPick: full },
        { label: t("Open book split"), onPick: () => shower.split(o.book, o.page) },
      ]}
    />
  ) : null
  return { onClick, bubble }
}
