// メニューの 1 行（アイコン・名前・キー）。右クリックのメニューのコマンドの行と、メニューが自分で並べる行（ページのタイプの一覧など）が使う
import type { ReactNode } from "react"
import styles from "./ContextMenuHost.module.css"

export function MenuRow(props: {
  icon?: ReactNode
  label: string
  keyLabel?: string | null
  title?: string
  disabled?: boolean
  onPick(): void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.item}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onPick}
    >
      {props.icon && <span className={styles.icon}>{props.icon}</span>}
      <span className={styles.label}>{props.label}</span>
      {props.keyLabel && <kbd className={styles.key}>{props.keyLabel}</kbd>}
    </button>
  )
}
