// ダイアログ: 描いている間、画面の上に出し、ほかの操作を止める。Esc か外側を押すと閉じる（onClose）。
// actions は見出しの行の右に並べる物（ボタンなど。何を置くかは使う側が決める）。開くと、中身の最初の入力欄に焦点を当てる
import { type ReactNode, useLayoutEffect, useRef } from "react"
import styles from "./Dialog.module.css"

export function Dialog({
  title,
  actions,
  onClose,
  children,
}: {
  title: string
  actions?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const unmounting = useRef(false) // 描くのをやめるときに自分で閉じている間
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    unmounting.current = false
    if (!d.open) {
      d.showModal()
      d.querySelector<HTMLElement>(`.${styles.content} :is(input, textarea, select)`)?.focus()
    }
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
      // Escape で閉じるのは keydown だけが受ける（文字の変換中の Escape は変換の取り消しなので閉じない）。ブラウザ自身の閉じ方（cancel）は止める
      onCancel={e => e.preventDefault()}
      onKeyDown={e => {
        if (e.key === "Escape" && !e.nativeEvent.isComposing) onClose()
      }}
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {actions && <div className={styles.headActions}>{actions}</div>}
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </dialog>
  )
}
