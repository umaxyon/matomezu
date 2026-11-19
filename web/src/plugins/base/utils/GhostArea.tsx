// ゴーストエリア: 画面のいちばん手前の、ゴーストなどドラッグの間だけ出す物を描く所。
// 紙のように倍率で transform された中からでも、子を窓の座標（position: fixed）で描ける。ポインタを受けない
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import styles from "./GhostArea.module.css"

export function GhostArea({ children }: { children: ReactNode }) {
  return createPortal(
    <div className={styles.area} data-ghost-area>
      {children}
    </div>,
    document.body,
  )
}
