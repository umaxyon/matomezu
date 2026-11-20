// ステージの左に縦に並べるページ一覧（ウィジェット page-list。スロット stage-side）: バインダ（スライド）を開いている間だけ出し、開いているバインダのページを並べる。
// ページごとに、ページの番号とサムネイルを並べる。サムネイルは、ページのタイプのプレゼンテーションの印刷区画 1 つのビュー（printSheet）で描き、一覧の幅に合わせて縮める
// （ステージの拡大縮小には従わない）。押したページをそのステージで開く（コマンド page-open）。開いているページは枠と太字の番号で示す。
// ドラッグで並べ替える（useTabDrag の縦。アクション page-move）。ページの右クリックでメニュー（page-list-context。ここに追加・複製・削除）。
// 一覧の下の＋は、最後にページを足す（コマンド page-add-after。空のバインダなら、そのバインダに足して開く）。ロック中のページには鍵の印を付ける

import { useRef, useState } from "react"
import { findBinder, pagesIn } from "../../../core/book"
import type { Size } from "../../../core/geom"
import type { Book, Page } from "../../../core/schema/book"
import { binderOf, shownPageId } from "../../../core/stage"
import { useCommand } from "../../../ui/commands"
import { useContextMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { PageScope, useStageHere } from "../../../ui/scope"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useAllowed } from "../../../ui/view-hooks"
import { usePageLookStyle } from "../book-look/use-page-look-style"
import { kit } from "../kit"
import { LockIcon } from "../lock/LockIcon"
import { PAGE_ADD } from "../pages/page-add"
import { pageArea } from "../place/grow"
import { Printing } from "../print-preview/printing"
import { SheetLayers } from "../print-preview/SheetLayers"
import { useResize } from "../utils/useResize"
import { PAGE_ADD_AFTER, PAGE_LIST_CONTEXT, PAGE_OPEN } from "."
import styles from "./PageList.module.css"
import { useAddPage } from "./useAddPage"
import { useTabDrag } from "./useTabDrag"

// ページ 1 枚のサムネイル
// ステージの外で描くので、中の物には窓に無い id を渡す（ステージの選択などが中に写らない）
function Thumbnail({ book, page }: { book: Book; page: Page }) {
  const catalog = useCatalog().core
  const [width, setWidth] = useState(0)
  const size = pageArea(catalog, page).size
  const scale = width / size.w
  return (
    <PageScope book={book.id} page={page.id} zoom={scale || 1}>
      <ThumbnailFrame book={book} page={page} size={size} scale={scale} onWidth={setWidth} />
    </PageScope>
  )
}

// 紙の大きさ（無ければ 16:9）のままのビューを、一覧の幅に合わせて縮める
function ThumbnailFrame({
  book,
  page,
  size,
  scale,
  onWidth,
}: {
  book: Book
  page: Page
  size: Size
  scale: number
  onWidth(w: number): void
}) {
  const look = usePageLookStyle()
  const frame = useRef<HTMLDivElement | null>(null)
  useResize(frame, size => onWidth(size.w))
  return (
    <div ref={frame} className={styles.thumb} style={{ ...look, aspectRatio: `${size.w} / ${size.h}` }}>
      {scale > 0 && (
        <div className={styles.scaled} style={{ width: size.w, height: size.h, transform: `scale(${scale})` }}>
          <Printing>
            <SheetLayers book={book} page={page} column={0} row={0} paper={size} />
          </Printing>
        </div>
      )}
    </div>
  )
}

export function PageList() {
  const opened = useStageHere(st => st?.opened)
  const book = useMatomezuState(s => (opened ? s.books[opened.outermost] : undefined))
  const openPage = useCommand(PAGE_OPEN.id)
  const addAfter = useCommand(PAGE_ADD_AFTER.id)
  const addInto = useAddPage()
  const adds = useAllowed(PAGE_ADD.id).ok
  const openMenu = useContextMenu(PAGE_LIST_CONTEXT)
  const t = useMessages(kit)
  const list = useRef<HTMLDivElement | null>(null)
  const binder = book && opened ? findBinder(book, binderOf(book, opened) ?? "") : undefined
  const pages = book && binder ? pagesIn(book, binder.id) : []
  const drag = useTabDrag(
    list,
    pages.map(p => p.id),
    "y",
  )
  if (!book || !binder || !openPage.enabled) return null
  const shown = shownPageId(opened ?? null)
  const last = pages.at(-1)
  return (
    <nav className={styles.list} aria-label={t("Page list")} ref={list} data-page-list>
      {pages.map((p, i) => (
        <div
          key={p.id}
          className={styles.item}
          ref={drag.slot(p.id)}
          data-selected={p.id === shown}
          data-carried={drag.drag?.id === p.id}
          data-page={p.id}
        >
          <span className={styles.number}>{i + 1}</span>
          {p.locked && (
            <span className={styles.lock} role="img" aria-label={t("Locked")}>
              <LockIcon />
            </span>
          )}
          <button
            type="button"
            className={styles.page}
            aria-label={p.title}
            aria-current={p.id === shown ? "page" : undefined}
            onClick={() => {
              if (!drag.swallowClick()) openPage.run(p.id)
            }}
            onContextMenu={e => openMenu(e, { page: p.id })}
            {...drag.handlers(p.id)}
          >
            <Thumbnail book={book} page={p} />
          </button>
        </div>
      ))}
      {drag.bar !== null && <div className={styles.dropBar} style={{ top: drag.bar }} />}
      {(last ? addAfter.shown : adds) && (
        <button
          type="button"
          className={styles.add}
          aria-label={t("Add page")}
          onClick={() =>
            last ? addAfter.run({ page: last.id }) : addInto({ type: binder.pageType, into: { binder: binder.id } })
          }
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      )}
    </nav>
  )
}
