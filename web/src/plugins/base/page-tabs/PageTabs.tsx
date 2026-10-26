// ステージのページのタブ（ウィジェット page-tabs）: そのステージのブックのページを並べる（ページを持たないブックはタブを出さない）。
// 押したページをそのステージで開く（コマンド page-open）。ブックのタイプが決めていれば、＋でページを作る（コマンド page-new）
import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import { actionsOf } from "../../../core/perform"
import type { Book } from "../../../core/schema/book"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import styles from "./PageTabs.module.css"

// ページタブの横に、ページを足すボタンを出すか（タイプが出すと決め、ブックで page-add が使える）
function addsFromTabs(catalog: CoreCatalog, book: Book): boolean {
  return (
    hasPages(book) &&
    bookType(catalog, book.type).pages?.addFromTabs === true &&
    actionsOf(catalog, book).includes("@matomezu/base:page-add")
  )
}

export function PageTabs({ stage }: { stage: string }) {
  const opened = useMatomezuState(s => s.workspace.stages.find(x => x.id === stage)?.opened)
  const book = useMatomezuState(s => (opened ? s.books[opened.book] : undefined))
  const openPage = useCommand(stage, "@matomezu/base:page-open")
  const newPage = useCommand(stage, "@matomezu/base:page-new")
  const catalog = useCatalog().core
  const t = useMessages(kit)
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
