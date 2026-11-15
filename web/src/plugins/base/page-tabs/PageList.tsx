// ステージの左に縦に並べるページ一覧（ウィジェット page-list。スロット stage-side）: ブックのタイプが ページ一覧（pageList）を選んでいるときだけ出す。
// ページごとに、ページの番号とサムネイルを並べる。サムネイルは、ブックのタイプの見せ方の印刷区画 1 つのビュー（printSheet）で描き、一覧の幅に合わせて縮める
// （ステージの拡大縮小には従わない）。押したページをそのステージで開く（コマンド page-open）。開いているページは枠と太字の番号で示す。
// ドラッグで並べ替える（useTabDrag の縦。アクション page-move）。ページの右クリックでメニュー（page-context。ここに追加・複製・削除）。
// 一覧の下の＋は、最後にページを足す（コマンド page-add-after。ページが 0 枚でも出す）。ロック中のページには鍵の印を付ける
import { useRef, useState } from "react"
import { hasPages, type PagedBook } from "../../../core/book"
import { bookType } from "../../../core/core-catalog"
import type { Size } from "../../../core/geom"
import type { Page } from "../../../core/schema/book"
import { stageIn } from "../../../core/window"
import { useCommand } from "../../../ui/commands"
import { useContextMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { PageScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useBookLookStyle } from "../book-look/use-book-look-style"
import { kit } from "../kit"
import { LockIcon } from "../lock/LockIcon"
import { pageArea } from "../place/items"
import { Printing } from "../print-preview/printing"
import { SheetLayers } from "../print-preview/SheetLayers"
import { useResize } from "../utils/useResize"
import type { StageSlotProps } from "../workspace/ui"
import { PAGE_ADD_AFTER, PAGE_CONTEXT, PAGE_OPEN } from "."
import styles from "./PageList.module.css"
import { useTabDrag } from "./useTabDrag"

// ページ 1 枚のサムネイル
// ステージの外で描くので、中の物には窓に無い id を渡す（ステージの選択などが中に写らない）
function Thumbnail({ book, page }: { book: PagedBook; page: Page }) {
  const catalog = useCatalog().core
  const [width, setWidth] = useState(0)
  const size = pageArea(catalog, book, page)?.size ?? { w: 1280, h: 720 }
  const scale = width / size.w
  return (
    <PageScope book={book.id} page={page.id} zoom={scale || 1}>
      {stage => <ThumbnailFrame stage={stage} book={book} page={page} size={size} scale={scale} onWidth={setWidth} />}
    </PageScope>
  )
}

// 紙の大きさ（無ければ 16:9）のままのビューを、一覧の幅に合わせて縮める
function ThumbnailFrame({
  stage,
  book,
  page,
  size,
  scale,
  onWidth,
}: {
  stage: string
  book: PagedBook
  page: Page
  size: Size
  scale: number
  onWidth(w: number): void
}) {
  const look = useBookLookStyle(book.type)
  const frame = useRef<HTMLDivElement | null>(null)
  useResize(frame, size => onWidth(size.w))
  return (
    <div ref={frame} className={styles.thumb} style={{ ...look, aspectRatio: `${size.w} / ${size.h}` }}>
      {scale > 0 && (
        <div className={styles.scaled} style={{ width: size.w, height: size.h, transform: `scale(${scale})` }}>
          <Printing>
            <SheetLayers stage={stage} book={book} page={page} column={0} row={0} paper={size} />
          </Printing>
        </div>
      )}
    </div>
  )
}

export function PageList({ stage }: StageSlotProps) {
  const opened = useMatomezuState(s => stageIn(s.window, stage)?.opened)
  const book = useMatomezuState(s => (opened ? s.books[opened.book] : undefined))
  const catalog = useCatalog().core
  const openPage = useCommand(PAGE_OPEN.id)
  const addAfter = useCommand(PAGE_ADD_AFTER.id)
  const openMenu = useContextMenu(PAGE_CONTEXT)
  const t = useMessages(kit)
  const list = useRef<HTMLDivElement | null>(null)
  const pages = book && hasPages(book) ? book.pages : []
  const drag = useTabDrag(
    list,
    pages.map(p => p.id),
    "y",
  )
  if (!book || !hasPages(book) || !bookType(catalog, book.type).pageList || !openPage.enabled) return null
  return (
    <nav className={styles.list} aria-label={t("Page list")} ref={list} data-page-list>
      {book.pages.map((p, i) => (
        <div
          key={p.id}
          className={styles.item}
          ref={drag.slot(p.id)}
          data-selected={p.id === opened?.page}
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
            aria-current={p.id === opened?.page ? "page" : undefined}
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
      {addAfter.shown && (
        <button
          type="button"
          className={styles.add}
          aria-label={t("Add page")}
          onClick={() => addAfter.run({ page: book.pages.at(-1)?.id })}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      )}
    </nav>
  )
}
