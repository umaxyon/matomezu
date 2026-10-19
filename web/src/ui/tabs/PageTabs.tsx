// ステージのページのタブ: そのステージのブックのページを並べる。押したページをそのステージで開き、＋でページを足す
import { useActions, useApp } from "../store-context"
import styles from "./PageTabs.module.css"

export function PageTabs({ stage }: { stage: string }) {
  const book = useApp(s => {
    const st = s.workspace.stages.find(x => x.id === stage)
    return st && s.books[st.book]
  })
  const page = useApp(s => s.workspace.stages.find(x => x.id === stage)?.page)
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
            onClick={() => openPage(stage, p.id)}
          >
            {p.title}
          </button>
        ))}
        <button type="button" className={styles.add} aria-label="ページを足す" onClick={() => addPage(stage)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
