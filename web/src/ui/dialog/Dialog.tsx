// ダイアログ: 描いている間、画面の上に出し、ほかの操作を止める。Esc か外側を押すと閉じる（onClose）
import { type ReactNode, useLayoutEffect, useRef } from "react"
import styles from "./Dialog.module.css"

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    return () => d.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      onClose={onClose}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={e => {
        if (e.key === "Escape") onClose()
      }}
    >
      <div className={styles.body}>
        <h2 className={styles.title}>{title}</h2>
        {children}
      </div>
    </dialog>
  )
}
