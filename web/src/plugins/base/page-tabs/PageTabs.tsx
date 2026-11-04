// ステージのページのタブ（ウィジェット page-tabs）: そのステージのブックのページを並べる（ページを持たないブックはタブを出さない）。
// 押したページをそのステージで開く（コマンド page-open）。ブックのタイプが決めていれば、＋でページを作る（コマンド page-new。開くダイアログはタイプが決められる）。
// ロック中のページのタブには鍵の印を出す（押せない。外すのはページの設定のダイアログ）。
// タブが横にあふれているときは、ホイールの縦の回転で横にスクロールする。
// タブはドラッグで並べ替えられる（useTabDrag。アクション page-move）。掴んだタブは元の所で薄くなり、写しがポインタに付き、落とす所に線が出る
import { useRef } from "react"
import { hasPages } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { LockIcon } from "../lock/LockIcon"
import { PAGE_NEW, PAGE_OPEN } from "."
import styles from "./PageTabs.module.css"
import { useTabDrag } from "./useTabDrag"

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
  const list = useRef<HTMLDivElement | null>(null)
  const pages = book && hasPages(book) ? book.pages : []
  const tabDrag = useTabDrag(
    stage,
    list,
    pages.map(p => p.id),
  )
  if (!book || !hasPages(book)) return <div className={styles.tabs} />
  const { drag } = tabDrag
  const grabbed = drag && book.pages.find(p => p.id === drag.id)
  return (
    <div
      className={styles.tabs}
      role="tablist"
      aria-label={book.title}
      ref={el => {
        list.current = el
        return sideways(el)
      }}
    >
      {book.pages.map(p => (
        <span key={p.id} className={styles.slot} ref={tabDrag.slot(p.id)} data-carried={drag?.id === p.id}>
          <button
            type="button"
            role="tab"
            className={styles.tab}
            data-locked={p.locked === true}
            aria-selected={p.id === opened?.page}
            onClick={() => {
              if (!tabDrag.swallowClick()) openPage.run(p.id)
            }}
            {...tabDrag.handlers(p.id)}
          >
            {p.title}
          </button>
          {p.locked && (
            <span className={styles.lock} role="img" aria-label={t("Locked")}>
              <LockIcon />
            </span>
          )}
        </span>
      ))}
      {tabDrag.bar !== null && <div className={styles.dropBar} style={{ left: tabDrag.bar }} />}
      {drag && grabbed && (
        <div className={styles.ghost} style={{ left: drag.x - drag.grab, top: drag.y - 12 }}>
          {grabbed.title}
        </div>
      )}
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
