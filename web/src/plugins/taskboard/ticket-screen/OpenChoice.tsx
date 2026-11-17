// チケットスクリーンの中のチケットの番号のリンクを押したときの「開く／分割で開く」の吹き出し。チケットスクリーン 1 枚が OpenChoiceHost で包み、
// 中のリンク（本文・履歴の行・質問の文）は useAskOpen で開き方を聞く。窓が低くて分けられないときは、聞かずに開く。
// 吹き出しは base の ChoiceBubble（押したリンクの下に出し、外を押すか Esc で閉じる）
import { createContext, type ReactNode, useCallback, useContext, useState } from "react"
import { useMessages } from "../../../plugin-api/ui"
import { belowOf, ChoiceBubble } from "../../base/ui"
import { kit } from "../kit"
import { useOpenTicket } from "./useOpenTicket"

type Ask = (ticket: string, from: Element) => void

const AskContext = createContext<Ask | null>(null)

// 吹き出しで、押したリンクのチケット ticket の開き方を聞く関数（OpenChoiceHost の外なら、聞かずに開く）
export function useAskOpen(): Ask {
  const ask = useContext(AskContext)
  const opener = useOpenTicket()
  return ask ?? (ticket => opener.here(ticket))
}

export function OpenChoiceHost({ children }: { children: ReactNode }) {
  const t = useMessages(kit)
  const opener = useOpenTicket()
  const [asked, setAsked] = useState<{ ticket: string; from: Element } | null>(null)
  const ask = useCallback<Ask>(
    (ticket, from) => {
      if (!opener.tall) return opener.here(ticket)
      setAsked({ ticket, from })
    },
    [opener],
  )
  const close = useCallback(() => setAsked(null), [])
  return (
    <AskContext.Provider value={ask}>
      {children}
      {asked ? (
        <ChoiceBubble
          at={belowOf(asked.from)}
          onClose={close}
          choices={[
            { label: t("Open"), onPick: () => opener.here(asked.ticket) },
            { label: t("Open split"), onPick: () => opener.beside(asked.ticket) },
          ]}
        />
      ) : null}
    </AskContext.Provider>
  )
}
