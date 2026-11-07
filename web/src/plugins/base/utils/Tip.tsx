// 乗せたらすぐ出す、押す物の題の吹き出し（標準の title は少し待たされるので使わない）。見た目は伝言の吹き出しと同じ（スキンの bubble・枠・角丸・影）
// 押す物の下に、右端をそろえて出し、押す物の方へ向く尾を上に付ける。押す物の見た目は変えず、題は読み上げに使わない（押す物の aria-label が答える）
import type { ReactNode } from "react"
import styles from "./Tip.module.css"

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className={styles.tip}>
      {children}
      <span className={styles.bubble} aria-hidden="true">
        <span className={styles.text}>{text}</span>
      </span>
    </span>
  )
}
