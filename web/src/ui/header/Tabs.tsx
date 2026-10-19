// カレントのステージのブックのページのタブ。押したページをカレントのステージで開き、＋でページを足す
import { currentStage } from "../../core/workspace"
import { useActions, useApp } from "../store-context"
import styles from "./Tabs.module.css"

export function Tabs() {
  const book = useApp(s => s.books[currentStage(s.workspace).book])
  const page = useApp(s => currentStage(s.workspace).page)
  const { openPage, addPage } = useActions()
  if (!book) return null
  return (
    <div className={styles.tabs}>
      <div className={styles.group} role="tablist" aria-label={book.title}>
        {book.pages.map(p => (
          <button
            key={p.id}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={p.id === page}
            onClick={() => openPage(p.id)}
          >
            {p.title}
          </button>
        ))}
        <button type="button" className={styles.add} aria-label="ページを足す" onClick={addPage}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
