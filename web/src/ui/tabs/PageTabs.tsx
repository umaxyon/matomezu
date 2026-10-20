// ステージのページのタブ: 左端にブックを開くボタン、その右にそのステージのブックのページを並べる（ページを持たないブックはタブを出さない）。
// 押したページをそのステージで開き、＋でページを足す
import { useState } from "react"
import { hasPages } from "../../core/book"
import { OpenBookDialog } from "../book-search/OpenBookDialog"
import { useT } from "../i18n"
import { useActions, useApp } from "../store-context"
import styles from "./PageTabs.module.css"

export function PageTabs({ stage }: { stage: string }) {
  const opened = useApp(s => s.workspace.stages.find(x => x.id === stage)?.opened)
  const book = useApp(s => (opened ? s.books[opened.book] : undefined))
  const { openPage, addPage } = useActions()
  const [picking, setPicking] = useState(false)
  const t = useT()
  return (
    <div className={styles.tabs}>
      <button type="button" className={styles.open} aria-label={t("ブックを開く")} onClick={() => setPicking(true)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3.5h4l1.5 1.5h5.5v7.5h-11z" />
        </svg>
      </button>
      {book && hasPages(book) && opened?.page && (
        <div className={styles.group} role="tablist" aria-label={book.title}>
          {book.pages.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={p.id === opened.page}
              onClick={() => openPage(stage, p.id)}
            >
              {p.title}
            </button>
          ))}
          <button type="button" className={styles.add} aria-label={t("ページを足す")} onClick={() => addPage(stage)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
        </div>
      )}
      <OpenBookDialog stage={stage} open={picking} onClose={() => setPicking(false)} />
    </div>
  )
}
