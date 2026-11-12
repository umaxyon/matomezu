// 面の上端の見出し帯（下に線・少し違う地）。面の余白を打ち消して左右いっぱいに広げる。tall は見出しの高い帯、spread は両端に分ける
import type { ReactNode } from "react"
import styles from "./Band.module.css"

export function Band({ tall, spread, children }: { tall?: boolean; spread?: boolean; children: ReactNode }) {
  const classes = [styles.band, tall ? styles.tall : "", spread ? styles.spread : ""].filter(Boolean).join(" ")
  return <div className={classes}>{children}</div>
}
