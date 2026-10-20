// ダイアログ: 描いている間、画面の上に出し、ほかの操作を止める。Esc か外側を押すと閉じる（onClose）
import { type ReactNode, useLayoutEffect, useRef } from "react"
import styles from "./Dialog.module.css"

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const unmounting = useRef(false) // 描くのをやめるときに自分で閉じている間
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    unmounting.current = false
    if (!d.open) d.showModal()
    return () => {
      unmounting.current = true
      d.close()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      // 自分で閉じたときの知らせは、閉じたことにしない。知らせはすぐ届くことも後から届くこともあり、
      // 後から届いたときにもう開き直していれば（StrictMode が描き直したときなど）それも閉じたことにしない
      onClose={e => {
        if (!unmounting.current && !e.currentTarget.open) onClose()
      }}
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
