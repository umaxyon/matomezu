// 確かめるモーダル: 開いているダイアログの上に重ねて出し、文と、する・やめるのボタンで答えを受ける（store のダイアログは 1 つだけなので、使う側のダイアログの中に置く）。
// 開くと「やめる」に焦点を当てる。Escape と外側を押すとやめる、Enter は焦点のあるボタン。下のダイアログのキー（閉じる・決める）には渡さない
import { type KeyboardEvent, useLayoutEffect, useRef } from "react"
import styles from "./Dialog.module.css"

export function Confirm({
  message,
  ok,
  cancel,
  onOk,
  onCancel,
}: {
  message: string
  ok: string // する（ボタンの名前）
  cancel: string // やめる（ボタンの名前）
  onOk: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    keep.current?.focus()
    return () => d.close()
  }, [])
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" && e.key !== "Enter") return
    e.stopPropagation()
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }
  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${styles.confirm}`}
      role="alertdialog"
      aria-label={message}
      onKeyDown={onKey}
      onCancel={e => e.preventDefault()}
      onClick={e => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className={styles.confirmBody}>
        <p className={styles.confirmText}>{message}</p>
        <div className={styles.headActions}>
          <button ref={keep} type="button" className={styles.plain} onClick={onCancel}>
            {cancel}
          </button>
          <button type="button" className={styles.submit} onClick={onOk}>
            {ok}
          </button>
        </div>
      </div>
    </dialog>
  )
}
