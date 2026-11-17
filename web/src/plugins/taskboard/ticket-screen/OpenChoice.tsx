// チケットスクリーンの中のチケットの番号のリンクを押したときの「開く／分割して開く」の吹き出し。チケットスクリーン 1 枚が OpenChoiceHost で包み、
// 中のリンク（本文・履歴の行・質問の文）は useAskOpen で開き方を聞く。窓が低くて分けられないときは、聞かずに開く。
// 吹き出しは押したリンクの下に出し（窓の上に重ねる）、外を押すか Esc で閉じる
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useMessages } from "../../../plugin-api/ui"
import { kit } from "../kit"
import styles from "./OpenChoice.module.css"
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
  const opener = useOpenTicket()
  const [asked, setAsked] = useState<{ ticket: string; x: number; y: number } | null>(null)
  const ask = useCallback<Ask>(
    (ticket, from) => {
      if (!opener.tall) return opener.here(ticket)
      const r = from.getBoundingClientRect()
      setAsked({ ticket, x: r.left, y: r.bottom })
    },
    [opener],
  )
  return (
    <AskContext.Provider value={ask}>
      {children}
      {asked ? (
        <Choice
          x={asked.x}
          y={asked.y}
          onClose={() => setAsked(null)}
          onOpen={() => opener.here(asked.ticket)}
          onSplit={() => opener.beside(asked.ticket)}
        />
      ) : null}
    </AskContext.Provider>
  )
}

function Choice({
  x,
  y,
  onClose,
  onOpen,
  onSplit,
}: {
  x: number
  y: number
  onClose: () => void
  onOpen: () => void
  onSplit: () => void
}) {
  const t = useMessages(kit)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector("button")?.focus()
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener("pointerdown", outside, true)
    return () => document.removeEventListener("pointerdown", outside, true)
  }, [onClose])
  const pick = (run: () => void) => () => {
    onClose()
    run()
  }
  return createPortal(
    <div
      ref={box}
      className={styles.choice}
      style={{ left: x, top: y }}
      role="menu"
      onKeyDown={e => {
        if (e.key !== "Escape") return
        e.stopPropagation()
        onClose()
      }}
    >
      <button type="button" role="menuitem" className={styles.item} onClick={pick(onOpen)}>
        {t("Open")}
      </button>
      <button type="button" role="menuitem" className={styles.item} onClick={pick(onSplit)}>
        {t("Open split")}
      </button>
    </div>,
    document.body,
  )
}
