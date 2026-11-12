// 枠線と地を持つ面（左の列の各枠・プロジェクトの領域・ワークルーム）。recess は領域の奥の面（余白なし・はみ出しを切る）
import type { ComponentProps } from "react"
import styles from "./Panel.module.css"

export function Panel({ recess, className, ...rest }: ComponentProps<"section"> & { recess?: boolean }) {
  const classes = [styles.panel, recess ? styles.recess : "", className ?? ""].filter(Boolean).join(" ")
  return <section className={classes} {...rest} />
}
