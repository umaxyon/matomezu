// 右の領域に重ねる画面の 1 枚（プロジェクト・書庫）。前に出た方が上から滑り込んで重なる。最初の表示では滑り込ませない
import type { ReactNode } from "react"
import styles from "./ScreenPane.module.css"

export function ScreenPane({ front, slideIn, children }: { front: boolean; slideIn: boolean; children: ReactNode }) {
  return (
    <div className={styles.pane} data-front={front} data-slide-in={slideIn}>
      {children}
    </div>
  )
}
