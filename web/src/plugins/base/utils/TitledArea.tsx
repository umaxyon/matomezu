// 題の帯と、右上の最大化ボタンを持つ領域（書庫・タスクボード）。帯の右は、最大化ボタンを避けて空ける。actions は帯の題の右に並べる物（歯車など）
import type { ReactNode } from "react"
import { Band } from "./Band"
import { MaxButton } from "./MaxButton"
import styles from "./TitledArea.module.css"

export function TitledArea({
  title,
  actions,
  maximized,
  onToggleMaximize,
  className,
  children,
}: {
  title: string
  actions?: ReactNode
  maximized: boolean
  onToggleMaximize: () => void
  className?: string
  children?: ReactNode
}) {
  return (
    <section className={className ? `${styles.area} ${className}` : styles.area}>
      <MaxButton maximized={maximized} onToggle={onToggleMaximize} />
      <Band tall>
        <h3 className={styles.title}>{title}</h3>
        {actions}
      </Band>
      {children}
    </section>
  )
}
