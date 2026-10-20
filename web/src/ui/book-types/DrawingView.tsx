// 図面のブックのビュー: ステージの紙の置き場所（core/stage.ts の placement）に紙を描く
import type { Stage } from "../../core/stage"
import { placement } from "../../core/stage"
import { useT } from "../i18n"
import styles from "./DrawingView.module.css"

export function DrawingView({ stage }: { stage: Stage }) {
  const t = useT()
  const p = placement(stage)
  if (!p) return null
  return (
    <div
      className={styles.paper}
      role="img"
      aria-label={t("紙")}
      style={{ width: p.w, height: p.h, transform: `translate(${p.x}px, ${p.y}px) scale(${p.zoom})` }}
    />
  )
}
