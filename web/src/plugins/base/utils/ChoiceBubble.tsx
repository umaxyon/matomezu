// 押した要素（from）の下に、選ぶ物を縦に並べた小さな吹き出しを出す（本文の中のリンクのように、押す物を包めない所から出す）。
// 見た目はほかの吹き出しと同じ（スキンの bubble・枠・角丸・影）。窓の上に重ねて出し、選ぶか、外を押すか、Esc で閉じる（onClose）。開くと最初の物に焦点を移す
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import styles from "./ChoiceBubble.module.css"

export interface Choice {
  label: string
  onPick: () => void
}

export function ChoiceBubble({
  from,
  choices,
  onClose,
}: {
  from: Element
  choices: readonly Choice[]
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const at = from.getBoundingClientRect()
  useEffect(() => {
    box.current?.querySelector("button")?.focus()
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener("pointerdown", outside, true)
    return () => document.removeEventListener("pointerdown", outside, true)
  }, [onClose])
  return createPortal(
    <div
      ref={box}
      className={styles.bubble}
      style={{ left: at.left, top: at.bottom }}
      role="menu"
      onKeyDown={e => {
        if (e.key !== "Escape") return
        e.stopPropagation()
        onClose()
      }}
    >
      {choices.map(c => (
        <button
          key={c.label}
          type="button"
          role="menuitem"
          className={styles.choice}
          onClick={() => {
            onClose()
            c.onPick()
          }}
        >
          {c.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
