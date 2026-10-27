// ステージのページのタブ（ウィジェット page-tabs）: そのステージのブックのページを並べる（ページを持たないブックはタブを出さない）。
// 押したページをそのステージで開く（コマンド page-open）。ブックのタイプが決めていれば、＋でページを作る（コマンド page-new。開くダイアログはタイプが決められる）。
// タブが横にあふれているときは、ホイールの縦の回転で横にスクロールする
import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { PAGE_NEW, PAGE_OPEN } from "."
import styles from "./PageTabs.module.css"

// ページタブの横に、ページを足すボタンを出すか（タイプが出すと決める。ページを作れるかはコマンド page-new が決める）
function addsFromTabs(catalog: CoreCatalog, book: Book): boolean {
  return hasPages(book) && bookType(catalog, book.type).addPagesFromTabs === true
}

// 横にあふれた要素の上で、ホイールの縦の回転を横のスクロールにする（あふれていない・横に回したときは、そのまま）。
// 止める（preventDefault）ために、React の onWheel ではなく passive でない受け手を付ける
function sideways(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return
  const onWheel = (e: WheelEvent) => {
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }
  el.addEventListener("wheel", onWheel, { passive: false })
  return () => el.removeEventListener("wheel", onWheel)
}

export function PageTabs({ stage }: { stage: string }) {
  const opened = useMatomezuState(s => s.workspace.stages.find(x => x.id === stage)?.opened)
  const book = useMatomezuState(s => (opened ? s.books[opened.book] : undefined))
  const openPage = useCommand(stage, PAGE_OPEN.id)
  const newPage = useCommand(stage, PAGE_NEW.id)
  const catalog = useCatalog().core
  const t = useMessages(kit)
  if (!book || !hasPages(book)) return <div className={styles.tabs} />
  return (
    <div className={styles.tabs} role="tablist" aria-label={book.title} ref={sideways}>
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
