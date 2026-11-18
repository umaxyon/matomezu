// 右の領域に重ねる画面の 1 枚（プロジェクト・書庫）。前に出た方が上から滑り込んで重なる。最初の表示では滑り込ませない。
// 後ろの 1 枚は、描いたまま押せなくする（前の 1 枚の下に隠れているので、キーでも読み上げでも届かせない）
import type { ReactNode } from "react"
import styles from "./ScreenPane.module.css"

export function ScreenPane({ front, slideIn, children }: { front: boolean; slideIn: boolean; children: ReactNode }) {
  return (
    <div className={styles.pane} data-front={front} data-slide-in={slideIn} aria-hidden={!front} inert={!front}>
      {children}
    </div>
  )
}
