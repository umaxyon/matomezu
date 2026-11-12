// 題の帯と、右上の最大化ボタンを持つ領域（書庫）。帯の右は、最大化ボタンを避けて空ける
import type { ReactNode } from "react"
import { Band } from "./Band"
import { MaxButton } from "./MaxButton"
import styles from "./TitledArea.module.css"

export function TitledArea({
  title,
  maximized,
  onToggleMaximize,
  children,
}: {
  title: string
  maximized: boolean
  onToggleMaximize: () => void
  children?: ReactNode
}) {
  return (
    <section className={styles.area}>
      <MaxButton maximized={maximized} onToggle={onToggleMaximize} />
      <Band tall>
        <h3 className={styles.title}>{title}</h3>
      </Band>
      {children}
    </section>
  )
}
