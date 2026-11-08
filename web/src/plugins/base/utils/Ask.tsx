// 問いと「はい」の組を並べた小さな吹き出しを出す所（マークと伝言の付ける先の鳥の「外す？」、伝言の「隠す」「表示」「消す」）。「はい」でその組の onYes を呼ぶ
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import styles from "./Ask.module.css"
import { STAND_MARGIN } from "./stand-place"

const LEAVE_GRACE = 400 // ポインタが離れてから吹き出しを隠すまでの ms

// 問いと「はい」の組。tone が danger なら「はい」を危険の色にする（外す・消す）
export interface AskItem {
  question: string
  onYes: () => void
  tone: "plain" | "danger"
}

// 吹き出しを出す所: above は押す物の上の真ん中、below は下の真ん中、bird は鳥の上。
// aboveRight は上に、右端を押す物の右端にそろえて左へ伸ばし、スタンドのレイヤーの上に入らなければ下に出す（belowRight はいつも下）
export type AskPlace = "above" | "below" | "bird" | "aboveRight" | "belowRight"

// 「外す？ [はい]」だけの問い（マークと、伝言の付ける先の鳥）
export function useRemoveAsk(onRemove: () => void): AskItem[] {
  const t = useMessages(kit)
  return [{ question: t("Remove?"), onYes: onRemove, tone: "danger" }]
}

// 押すと（opens が hover なら、マウスかペンを乗せても）問いの吹き出しを出す所。children は押す物（吹き出しを出し入れする関数を受け取る）。
// ポインタが離れて少し経つか、ほかを押すか、Esc で隠す
export function Ask({
  items,
  opens = "press",
  place = "above",
  onAsking,
  children,
}: {
  items: readonly AskItem[]
  opens?: "press" | "hover"
  place?: AskPlace
  onAsking?: (asking: boolean) => void
  children: (toggle: () => void) => ReactNode
}) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const [asking, setAsking] = useState(false)
  const [shown, setShown] = useState<AskPlace>(place)
  // 出すたびに、まず place に出して、上に入らなければ下へ移す
  useLayoutEffect(() => {
    if (!asking) return setShown(place)
    const box = bubble.current?.getBoundingClientRect()
    const layer = bubble.current?.closest("[data-stand-layer]")?.getBoundingClientRect()
    if (place === "aboveRight" && box && layer && box.top < layer.top + STAND_MARGIN) setShown("belowRight")
  }, [asking, place])
  // biome-ignore lint/correctness/useExhaustiveDependencies: 吹き出しを出し入れしたときだけ知らせる
  useEffect(() => {
    onAsking?.(asking)
  }, [asking])
  useEffect(() => {
    if (!asking) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAsking(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAsking(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [asking])
  // ポインタが離れたら少し待って隠す（押す物と吹き出しの間の隙間を通って「はい」へ行けるように。戻れば隠さない）
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stay = () => clearTimeout(leaving.current)
  useEffect(() => () => clearTimeout(leaving.current), [])
  return (
    <div
      ref={ref}
      className={styles.ask}
      data-place={shown}
      onPointerEnter={e => {
        stay()
        if (opens === "hover" && e.pointerType !== "touch") setAsking(true)
      }}
      onPointerLeave={() => {
        stay()
        leaving.current = setTimeout(() => setAsking(false), LEAVE_GRACE)
      }}
    >
      {asking && items.length > 0 && (
        <div ref={bubble} className={styles.askBubble}>
          {items.map(item => (
            // biome-ignore lint/a11y/useSemanticElements: 問いとボタンを束ねる箱で、入力Formのまとまり（fieldset）ではない
            <div key={item.question} className={styles.pair} role="group" aria-label={item.question}>
              <span>{item.question}</span>
              <button type="button" className={styles.yes} data-tone={item.tone} onClick={item.onYes}>
                {t("Yes")}
              </button>
            </div>
          ))}
        </div>
      )}
      {children(() => setAsking(a => !a))}
    </div>
  )
}
