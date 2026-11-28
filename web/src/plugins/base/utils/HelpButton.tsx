// 「？」の丸いボタン: 押すと、短い説明 text の吹き出しを、ボタンの下（入らなければ上。side で逆にできる）に窓の上に重ねて出す。
// 押したボタンがモーダルのダイアログの中なら、吹き出しもその中に出す。もう一度押すか、外を押すか、Esc で閉じる（Esc はダイアログまで届かせない）。焦点はボタンに残す。見た目はほかの吹き出しと同じ（スキンの bubble・枠・角丸・影）
import { type RefObject, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { belowOf } from "./ChoiceBubble"
import type { BubbleAt } from "./fit"
import styles from "./HelpButton.module.css"
import { usePlacedBubble } from "./use-placed-bubble"

// label はボタンの読み上げの名前（「？」だけでは何の説明か分からないので、説明する物の名前を添える）。
// side が above なら、吹き出しをボタンの上（入らなければ下）に出す（下に押す物が並ぶ所で、それを隠さないため）
export function HelpButton({ text, label, side = "below" }: { text: string; label: string; side?: "below" | "above" }) {
  const [at, setAt] = useState<BubbleAt | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  const close = () => setAt(null)
  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.button}
        aria-label={label}
        aria-expanded={at !== null}
        aria-controls={at ? id : undefined}
        onClick={e => setAt(at ? null : { ...belowOf(e.currentTarget), side })}
        onKeyDown={e => {
          if (e.key !== "Escape" || !at) return
          e.stopPropagation()
          close()
        }}
      >
        ?
      </button>
      {at && <HelpBubble id={id} at={at} text={text} anchor={button} onClose={close} />}
    </>
  )
}

function HelpBubble({
  id,
  at,
  text,
  anchor,
  onClose,
}: {
  id: string
  at: BubbleAt
  text: string
  anchor: RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const placed = usePlacedBubble(box, at)
  useEffect(() => {
    // ボタンを押したときは、ボタンの onClick が閉じる（ここで閉じると、続く onClick がまた開く）
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) onClose()
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("keydown", onEscape, true)
    return () => {
      document.removeEventListener("pointerdown", outside, true)
      document.removeEventListener("keydown", onEscape, true)
    }
  }, [anchor, onClose])
  return createPortal(
    <div ref={box} id={id} role="note" className={styles.bubble} style={{ left: placed.x, top: placed.y }}>
      {text}
    </div>,
    // モーダルのダイアログは最上層に描くので、その中で押したときはダイアログの中に出す（外に出すとダイアログの下に隠れる）
    anchor.current?.closest("dialog") ?? document.body,
  )
}
