// 確かめるモーダルと知らせるモーダル: ダイアログかスクリーンの上に重ねて出し、文（message。detail が在れば、その下に訳などの行）を見せる
// （store のダイアログは 1 つだけなので、使う側のビューの中に置く）。Confirm は、する・やめるのボタンで答えを受ける。Notice は、閉じるのボタンだけ。Blocking は閉じず、ボタン 1 つだけ。
// 開くと「やめる」（Notice は「閉じる」）に焦点を当てる。Escape と外側を押すとやめる（閉じる）、Enter は焦点のあるボタン。出している間、どのキーも下のダイアログとスクリーンのキーバインドには渡さない
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
} from "react"
import styles from "./Dialog.module.css"

// する・やめるのほかの選び方 1 つ（danger は取り消せない操作、disabled は選べない）
export interface ConfirmChoice {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

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
  ok: string // する（ボタンの名前）
  cancel: string // やめる（ボタンの名前）
  others?: readonly ConfirmChoice[] // する・やめるのほかの選び方（やめるとするの間に並べる）
  onOk: () => void
  onCancel: () => void
}) {
  return (
    <Modal message={message} detail={detail} close={cancel} onClose={onCancel}>
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
      <button type="button" className={styles.submit} onClick={onOk}>
        {ok}
      </button>
    </Modal>
  )
}

export function Notice({
  message,
  detail,
  close,
  onClose,
}: {
  message: string
  detail?: readonly string[] // 文の下に、1 つずつ行にして出す
  close: string // 閉じる（ボタンの名前）
  onClose: () => void
}) {
  return <Modal message={message} detail={detail} close={close} onClose={onClose} />
}

// 文と行と、焦点を当てる閉じる（やめる）のボタン close と、その後ろに並べるボタン children のモーダル
function Modal({
  message,
  detail,
  close,
  onClose,
  children,
}: {
  message: string
  detail: readonly string[] | undefined
  close: string
  onClose: () => void
  children?: ReactNode
}) {
  const keep = useRef<HTMLButtonElement>(null)
  // 外側を押して閉じるのは、押し始めも外側のときだけ
  const pressedOutside = useRef(false)
  return (
    <ModalFrame
      message={message}
      detail={detail}
      focus={keep}
      onEscape={onClose}
      onPointerDown={e => {
        pressedOutside.current = e.target === e.currentTarget
      }}
      onClick={e => {
        if (e.target === e.currentTarget && pressedOutside.current) onClose()
      }}
    >
      <button ref={keep} type="button" className={styles.plain} onClick={onClose}>
        {close}
      </button>
      {children}
    </ModalFrame>
  )
}

// 閉じないモーダル: 文と行と、ボタン 1 つ（action。焦点を当てる）。Escape でも外側を押しても閉じない。押したら onAction
export function Blocking({
  message,
  detail,
  action,
  onAction,
}: {
  message: string
  detail?: readonly string[] // 文の下に、1 つずつ行にして出す
  action: string // ボタンの名前
  onAction: () => void
}) {
  const keep = useRef<HTMLButtonElement>(null)
  return (
    <ModalFrame message={message} detail={detail} focus={keep}>
      <button ref={keep} type="button" className={styles.submit} onClick={onAction}>
        {action}
      </button>
    </ModalFrame>
  )
}

// モーダルの枠: 開くと focus に焦点を当て、文 message と行 detail と、ボタンの並び children を描く。出している間、どのキーも後ろのスクリーンのキーバインドには渡さない。
// Escape は onEscape（無ければ何もしない）、押した所の知らせは onPointerDown・onClick に渡す
function ModalFrame({
  message,
  detail,
  focus,
  onEscape,
  onPointerDown,
  onClick,
  children,
}: {
  message: string
  detail: readonly string[] | undefined
  focus: RefObject<HTMLButtonElement | null>
  onEscape?: () => void
  onPointerDown?: (e: PointerEvent<HTMLDialogElement>) => void
  onClick?: (e: MouseEvent<HTMLDialogElement>) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    focus.current?.focus()
    return () => d.close()
  }, [focus])
  const onKey = (e: KeyboardEvent) => {
    // 後ろのスクリーンのキーバインドには、どのキーも渡さない
    e.stopPropagation()
    if (e.key === "Escape") {
      e.preventDefault()
      onEscape?.()
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
      onPointerDown={onPointerDown}
      onClick={e => {
        e.stopPropagation()
        onClick?.(e)
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
        <div className={styles.headActions}>{children}</div>
      </div>
    </dialog>
  )
}
