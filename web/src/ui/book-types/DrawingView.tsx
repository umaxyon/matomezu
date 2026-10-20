// 図面のブックのビュー: ステージの紙の置き場所（core/stage.ts の placement）に紙を描く。
// ページが無ければ、真ん中にページを作るボタンを出す
import { useState } from "react"
import { hasPages } from "../../core/book"
import type { Stage } from "../../core/stage"
import { placement } from "../../core/stage"
import { NewPageDialog } from "../dialog/NewPageDialog"
import { useT } from "../i18n"
import { useApp } from "../store-context"
import styles from "./DrawingView.module.css"

export function DrawingView({ stage }: { stage: Stage }) {
  const t = useT()
  const p = placement(stage)
  if (stage.opened?.page === null) return <NoPages stage={stage} />
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

function NoPages({ stage }: { stage: Stage }) {
  const t = useT()
  const book = useApp(s => (stage.opened ? s.books[stage.opened.book] : undefined))
  const [creating, setCreating] = useState(false)
  if (!book || !hasPages(book)) return null
  return (
    <div className={styles.empty}>
      <p className={styles.prompt}>{t("ページがありません")}</p>
      <button type="button" className={styles.create} onClick={() => setCreating(true)}>
        {t("ページを作る")}
      </button>
      <NewPageDialog stage={stage.id} book={book} open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
