// ダイアログ: 描いている間、画面の上に出し、ほかの操作を止める。Esc か外側を押すと閉じる（onClose）。
// actions は見出しの行の右に並べる物（ボタンなど。何を置くかは使う側が決める）。開くと、中身の最初の入力欄に焦点を当てる。
// 決める・閉じるキー（既定は Enter・Escape）はキーの割り当てが受け、決めるように頼まれたら（store の dialog.submitted）中身の form を送る
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react"
import { useApp } from "../../../ui/store-context"
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
  const submitted = useApp(s => s.dialog?.submitted ?? 0)
  useEffect(() => {
    if (submitted > 0) ref.current?.querySelector("form")?.requestSubmit()
  }, [submitted])
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: 外側を押して閉じるのはポインタの操作で、閉じるキーはキーの割り当て（dialog.close）が受ける
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
      // 閉じるのはキーの割り当て（dialog.close）が受ける。ブラウザ自身の閉じ方（cancel）は止める
      onCancel={e => e.preventDefault()}
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
