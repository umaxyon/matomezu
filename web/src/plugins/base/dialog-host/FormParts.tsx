// 入力のダイアログの部品: 名前の付いた欄と、決めるボタンの行・見出しの行に置くボタン
import { type ReactNode, useId } from "react"
import styles from "./Dialog.module.css"

export const controlClass = styles.control
export const rowClass = styles.row

// 決められなかった理由の 1 行（決めるボタンを押して断られたとき）
export function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={styles.problem}>
      {children}
    </p>
  )
}

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

// 欄を並べた form。決めるボタンか、決めるキー（キーの割り当ての dialog.submit）で onSubmit。ready でなければ送らない。
// 1 行の欄の Enter でブラウザが送る動き（暗黙の送信）は止める（Enter はキーの割り当てが受ける）。
// submit があれば最後の行の右に決めるボタンを置き、無ければ置かない（見出しの行に ActionButton で置くときは、id をその form に渡す）
export function Form({
  id,
  submit,
  ready,
  onSubmit,
  children,
}: {
  id?: string
  submit?: string
  ready: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  return (
    <form
      id={id}
      className={styles.form}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault()
      }}
      onSubmit={e => {
        e.preventDefault()
        if (ready) onSubmit()
      }}
    >
      {children}
      {submit && (
        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={!ready}>
            {submit}
          </button>
        </div>
      )}
    </form>
  )
}

// 入り切りのスイッチ（名前は label。切れていて押せない間は、入っていても切れて見せる）
export function Switch({
  id,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  id?: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      className={styles.switch}
      aria-label={label}
      aria-checked={checked && !disabled}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  )
}

// 見出しの行などに置くボタン。form を渡すと、その form を送るボタンになる（primary は強調する）
export function ActionButton({
  form,
  primary = false,
  disabled = false,
  onClick,
  children,
}: {
  form?: string
  primary?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type={form ? "submit" : "button"}
      form={form}
      className={primary ? styles.submit : styles.plain}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
