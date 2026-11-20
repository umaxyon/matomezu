// 確かめるモーダル: ダイアログかスクリーンの上に重ねて出し、文（message。detail が在れば、その下に訳などの行）と、する・やめるのボタンで答えを受ける
// （store のダイアログは 1 つだけなので、使う側のビューの中に置く）。
// 開くと「やめる」に焦点を当てる。Escape と外側を押すとやめる、Enter は焦点のあるボタン。出している間、どのキーも下のダイアログとスクリーンのキーバインドには渡さない
import { type KeyboardEvent, useLayoutEffect, useRef } from "react"
import styles from "./Dialog.module.css"

// する・やめるのほかの選び方 1 つ（danger は取り消せない操作、disabled は選べない）
export interface ConfirmChoice {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

// する（ok はボタンの名前）。知らせるだけで、するの無いときは NO_OK（やめるのボタンだけを出す）
type ConfirmOk = { ok: string; onOk: () => void } | { ok: typeof NO_OK; onOk?: undefined }
export const NO_OK = "none"

export function Confirm({
  message,
  detail,
  ok,
  cancel,
  others,
  onOk,
  onCancel,
}: {
  message: string
  detail?: readonly string[] // 文の下に、1 つずつ行にして出す
  cancel: string // やめる（ボタンの名前。知らせるだけなら、閉じる）
  others?: readonly ConfirmChoice[] // する・やめるのほかの選び方（やめるとするの間に並べる）
  onCancel: () => void
} & ConfirmOk) {
  const ref = useRef<HTMLDialogElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  // 外側を押して閉じるのは、押し始めも外側のときだけ
  const pressedOutside = useRef(false)
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    keep.current?.focus()
    return () => d.close()
  }, [])
  const onKey = (e: KeyboardEvent) => {
    // 後ろのスクリーンのキーバインドには、どのキーも渡さない
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
      onPointerDown={e => {
        pressedOutside.current = e.target === e.currentTarget
      }}
      onClick={e => {
        e.stopPropagation()
        if (e.target === e.currentTarget && pressedOutside.current) onCancel()
      }}
    >
      <div className={styles.confirmBody}>
        <p className={styles.confirmText}>{message}</p>
        {detail?.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 行は並びが変わらない
          <p key={i} className={styles.confirmDetail}>
            {line}
          </p>
        ))}
        <div className={styles.headActions}>
          <button ref={keep} type="button" className={styles.plain} onClick={onCancel}>
            {cancel}
          </button>
          {others?.map(o => (
            <button
              key={o.label}
              type="button"
              className={styles.plain}
              data-danger={o.danger ? "" : undefined}
              disabled={o.disabled}
              onClick={o.onClick}
            >
              {o.label}
            </button>
          ))}
          {ok !== NO_OK && (
            <button type="button" className={styles.submit} onClick={onOk}>
              {ok}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
