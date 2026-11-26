// ステージの左に縦に並べるページ一覧（ウィジェット page-list。スロット stage-side）: バインダ（スライド）を開いている間だけ出し、開いているバインダのページを並べる
// （ブックの中のバインダも、ブックの外のバインダも）。
// ページごとに、ページの番号とサムネイルを並べる。サムネイルは、ページのタイプのプレゼンテーションの印刷区画 1 つのビュー（printSheet）で描き、一覧の幅に合わせて縮める
// （ステージの拡大縮小には従わない）。押したページをそのステージで開く（コマンド page-open）。開いているページは枠と太字の番号で示す。
// ドラッグで並べ替える（useTabDrag の縦。アクション page-move）。ページの右クリックでメニュー（page-list-context。ここに追加・複製・削除）。
// 一覧の下の＋は、最後にページを足す（コマンド page-add-after。空のバインダなら、そのバインダに足して開く）。ロック中のページには鍵の印を付ける。
// ブックの外のバインダのページも並べる（並べ替え・メニューの行・＋は、行えるかの問いとコマンドの when が決める）。
// バインダを指す参照エントリを開いている間は、指すバインダのページを見るだけで並べる（押すとそのページを見せる。コマンド reference-open。並べ替え・メニュー・＋は無い）

import { useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { findBinder, findReference, NO_BINDER, pagesIn } from "../../../core/book"
import { entriesIn } from "../../../core/entries"
import { outermostOf } from "../../../core/folders-tree"
import type { Size } from "../../../core/geom"
import { referencePage, referredOf, UNSEEN } from "../../../core/references"
import type { Page } from "../../../core/schema/book"
import {
  binderOf,
  NO_REFERENCE,
  NOTHING_OPENED,
  type OpenedReference,
  openedBook,
  openedReference,
  shownPageId,
} from "../../../core/stage"
import { NO_OUTSIDE_BINDER } from "../../../store/commands/def"
import { useCommand } from "../../../ui/commands"
import { useContextMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { PageScope, useStageHere } from "../../../ui/scope"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useAllowed, useOutsideBinder } from "../../../ui/view-hooks"
import { usePageLookStyle } from "../book-look/use-page-look-style"
import { kit } from "../kit"
import { LockIcon } from "../lock/LockIcon"
import { PAGE_ADD } from "../pages/page-add"
import { pageArea } from "../place/grow"
import { NOT_MEASURED } from "../print-preview/measures-state"
import { Printing } from "../print-preview/printing"
import { SheetLayers } from "../print-preview/SheetLayers"
import { useResize } from "../utils/useResize"
import { PAGE_ADD_AFTER, PAGE_LIST_CONTEXT, PAGE_OPEN, REFERENCE_OPEN } from "."
import styles from "./PageList.module.css"
import { useAddPage } from "./useAddPage"
import { useTabDrag } from "./useTabDrag"

// ページ 1 枚のサムネイル
// ステージの外で描くので、中の物には窓に無い id を渡す（ステージの選択などが中に写らない）
function Thumbnail({ outermost, page }: { outermost: string; page: Page }) {
  const catalog = useCatalog().core
  const [width, setWidth] = useState(0)
  const size = pageArea(catalog, page).size
  const scale = width / size.w
  return (
    <PageScope outermost={outermost} page={page.id} zoom={scale || 1}>
      <ThumbnailFrame page={page} size={size} scale={scale} onWidth={setWidth} />
    </PageScope>
  )
}

// 紙の大きさ（無ければ 16:9）のままのビューを、一覧の幅に合わせて縮める
function ThumbnailFrame({
  page,
  size,
  scale,
  onWidth,
}: {
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
            <SheetLayers page={page} column={0} row={0} paper={size} measured={NOT_MEASURED} />
          </Printing>
        </div>
      )}
    </div>
  )
}

export function PageList() {
  const opened = useStageHere(st => st?.opened ?? NOTHING_OPENED)
  const ref = openedReference(opened)
  return ref === NO_REFERENCE ? <LineupPageList /> : <ReferencedPageList opened={ref} />
}

// 参照エントリが指すバインダのページ（見るだけ。指す先がページか、見えなければ出さない）
function ReferencedPageList({ opened }: { opened: OpenedReference }) {
  const openReference = useCommand(REFERENCE_OPEN.id)
  const t = useMessages(kit)
  const found = useMatomezuState(
    useShallow(s => {
      const book = s.books[opened.outermost.id]
      const ref = book ? findReference(book, opened.reference) : undefined
      const to = ref ? referredOf(s, ref) : UNSEEN
      if (!ref || to === UNSEEN || to.kind !== "binder") return { outermost: null, lineup: null, shown: null }
      const at = outermostOf(s, to.binder.id)
      return {
        outermost: typeof at === "string" ? null : at.id,
        lineup: entriesIn(s.folders, to.binder.id),
        shown: referencePage(s, ref, opened.chosen),
      }
    }),
  )
  const rows = useMatomezuState(s => s.pages)
  const { outermost, lineup, shown } = found
  const pages = lineup ? lineup.flatMap(p => rows[p.id] ?? []) : []
  if (outermost === null || !openReference.enabled) return null
  return (
    <nav className={styles.list} aria-label={t("Page list")} data-page-list>
      {pages.map((p, i) => (
        <div key={p.id} className={styles.item} data-selected={p.id === shown} data-page={p.id}>
          <span className={styles.number}>{i + 1}</span>
          <button
            type="button"
            className={styles.page}
            aria-label={p.title}
            aria-current={p.id === shown ? "page" : undefined}
            onClick={() => openReference.run({ reference: opened.reference, chosen: p.id })}
          >
            <Thumbnail outermost={outermost} page={p} />
          </button>
        </div>
      ))}
    </nav>
  )
}

// 開いているブック（かブックの外のバインダ）のバインダのページ
function LineupPageList() {
  const opened = useStageHere(st => st?.opened ?? NOTHING_OPENED)
  const book = useMatomezuState(s => openedBook(s.books, opened))
  const openPage = useCommand(PAGE_OPEN.id)
  const addAfter = useCommand(PAGE_ADD_AFTER.id)
  const addInto = useAddPage()
  const adds = useAllowed(PAGE_ADD.id).ok
  const openMenu = useContextMenu(PAGE_LIST_CONTEXT)
  const t = useMessages(kit)
  const list = useRef<HTMLDivElement | null>(null)
  const shownBinder = useOutsideBinder()
  const outside = shownBinder === NO_OUTSIDE_BINDER ? undefined : shownBinder
  const binderId = book ? binderOf(book, opened) : NO_BINDER
  const binder = outside ?? (book && binderId !== NO_BINDER ? findBinder(book, binderId) : NO_BINDER)
  const pages = outside ? outside.lineup : book && binder !== NO_BINDER ? pagesIn(book, binder.id) : []
  const drag = useTabDrag(
    list,
    pages.map(p => p.id),
    "y",
  )
  const outermost = (outside ?? book)?.id
  if (outermost === undefined || binder === NO_BINDER || !openPage.enabled) return null
  const shown = shownPageId(opened)
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
            <Thumbnail outermost={outermost} page={p} />
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
