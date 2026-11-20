// コンテンツエリアに重ねる画面の 1 枚（プロジェクト・書庫）。出す方に替わった方が上から滑り込んで重なる。最初の表示では滑り込ませない。
// 後ろの 1 枚は、描いたまま押せなくする（前の 1 枚の下に隠れているので、キーでも読み上げでも届かせない）
import type { ReactNode } from "react"
import styles from "./ScreenPane.module.css"

export function ScreenPane({ shown, slideIn, children }: { shown: boolean; slideIn: boolean; children: ReactNode }) {
  return (
    <div className={styles.pane} data-shown={shown} data-slide-in={slideIn} aria-hidden={!shown} inert={!shown}>
      {children}
    </div>
  )
}
