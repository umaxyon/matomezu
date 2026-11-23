// 窓の中の点 at（押したマウスの位置や、押したリンクの左下）に、選ぶ物を縦に並べた小さな吹き出しを出す（本文の中のリンクのように、押す物を包めない所から出す）。
// 要素の左下を点にするのは belowOf
// 見た目はほかの吹き出しと同じ（スキンの bubble・枠・角丸・影）。窓の上に重ねて出し、選ぶか、外を押すか、Esc で閉じる（onClose）。開くと最初の物に焦点を移し、閉じると焦点を開く前の所へ戻す
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import styles from "./ChoiceBubble.module.css"

export interface Choice {
  label: string
  onPick: () => void
}

// 要素 el の左下（窓の中の点）
export function belowOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.bottom }
}

export function ChoiceBubble({
  at,
  choices,
  onClose,
}: {
  at: { x: number; y: number }
  choices: readonly Choice[]
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement
    const here = box.current
    here?.querySelector("button")?.focus()
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener("pointerdown", outside, true)
    return () => {
      document.removeEventListener("pointerdown", outside, true)
      // 焦点が吹き出しの中に残っていれば、開く前の所（押した行など）へ戻す
      const now = document.activeElement
      if (before instanceof HTMLElement && (now === null || now === document.body || here?.contains(now))) before.focus()
    }
  }, [onClose])
  return createPortal(
    <div
      ref={box}
      className={styles.bubble}
      style={{ left: at.x, top: at.y }}
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
