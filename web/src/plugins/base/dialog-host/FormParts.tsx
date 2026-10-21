// 入力のダイアログの部品: 名前の付いた欄と、決めるボタンの行
import { type ReactNode, useId } from "react"
import styles from "./Dialog.module.css"

export const controlClass = styles.control

// children は欄の id を受け取って、入力の部品を返す
export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  )
}

// 欄を並べた form。決めるボタンか Enter で onSubmit。ready でなければ押せない
export function Form({
  submit,
  ready,
  onSubmit,
  children,
}: {
  submit: string
  ready: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  return (
    <form
      className={styles.form}
      onSubmit={e => {
        e.preventDefault()
        if (ready) onSubmit()
      }}
    >
      {children}
      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={!ready}>
          {submit}
        </button>
      </div>
    </form>
  )
}
