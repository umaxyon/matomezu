// ステージのページのタブ（ウィジェット page-tabs）: そのステージのブックのページを並べる（ページを持たないブックはタブを出さない）。
// 押したページをそのステージで開く（コマンド page.open）。ブックのタイプが決めていれば、＋でページを作る（コマンド page.new）
import { addsFromTabs, hasPages } from "../../../core/book"
import { useCommand } from "../../../ui/commands"
import { useT } from "../../../ui/i18n"
import { useApp, useCatalog } from "../../../ui/store-context"
import styles from "./PageTabs.module.css"

export function PageTabs({ stage }: { stage: string }) {
  const opened = useApp(s => s.workspace.stages.find(x => x.id === stage)?.opened)
  const book = useApp(s => (opened ? s.books[opened.book] : undefined))
  const openPage = useCommand(stage, "page.open")
  const newPage = useCommand(stage, "page.new")
  const catalog = useCatalog().core
  const t = useT()
  if (!book || !hasPages(book)) return <div className={styles.tabs} />
  return (
    <div className={styles.tabs} role="tablist" aria-label={book.title}>
      {book.pages.map(p => (
        <button
          key={p.id}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={p.id === opened?.page}
          onClick={() => openPage.run(p.id)}
        >
          {p.title}
        </button>
      ))}
      {addsFromTabs(catalog, book) && newPage.shown && (
        <button type="button" className={styles.add} aria-label={t("Add page")} onClick={() => newPage.run()}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      )}
    </div>
  )
}
