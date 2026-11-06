// 利用者の設定の項目の行: 左に名前（幅をそろえる）、右に入力Form。項目のビュー（userSettingViews）も、この行で並びをそろえる。
// as を label にすると、行全体が入力Form の名前になる（入力Form が 1 つのとき）
import type { ReactNode } from "react"
import styles from "./UserSettings.module.css"

export function SettingRow({
  label,
  as = "div",
  children,
}: {
  label: string
  as?: "div" | "label"
  children: ReactNode
}) {
  const Row = as
  return (
    <Row className={styles.row}>
      <span className={styles.label}>{label}</span>
      {children}
    </Row>
  )
}
