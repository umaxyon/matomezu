// ステージのページのタブ（ウィジェット page-tabs）: そのステージのブックの並びを並べる（エントリ 1 つが 1 つのタブ。バインダは 1 つのタブで、名前はバインダの名前）。
// 押したページをそのステージで開く（コマンド page-open）。バインダのタブを押すと、そのバインダを開く（コマンド binder-open）。＋でタイプを選んでページを作る（AddPageMenu.tsx）。
// ロック中のページのタブには鍵の印を出す（押せない。外すのはページの設定のダイアログ）。
// タブが横にあふれているときは、ホイールの縦の回転で横にスクロールする。
// 選ばれたタブ（ブックかタブが替わったとき）と、並びが出たときは、選ばれたタブが見える所まで並びを送る（どの道で開いても同じ）。
// タブはドラッグで並べ替えられる（useTabDrag。アクション page-move・binder-move）。掴んだタブは元の所で薄くなり、写しがポインタに付き、落とす所に線が出る
import { useLayoutEffect, useRef } from "react"
import { lineupOf, NO_BINDER } from "../../../core/book"
import type { Library } from "../../../core/folders"
import type { LineupEntry } from "../../../core/schema/book"
import { binderOf, NO_PAGE_TYPE, NOTHING_OPENED, openedBook, shownPageId, shownType } from "../../../core/stage"
import { useCommand } from "../../../ui/commands"
import { useContextMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { useStageHere } from "../../../ui/scope"
import { useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { LockIcon } from "../lock/LockIcon"
import { GhostArea } from "../utils/GhostArea"
import { BINDER_CONTEXT, BINDER_OPEN, PAGE_CONTEXT, PAGE_OPEN } from "."
import { AddPageMenu } from "./AddPageMenu"
import { FileIcon } from "./FileIcon"
import styles from "./PageTabs.module.css"
import { ReferenceIcon } from "./ReferenceIcon"
import { useTabDrag } from "./useTabDrag"

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

// 並びの中の選ばれたタブ（鍵の印を含む枠）がはみ出していたら、はみ出した分だけ並びを横に送る。
// scrollIntoView は上の要素のスクロールまで動かすので使わない
function reveal(el: HTMLElement | null): void {
  const slot = el?.querySelector('[role="tab"][aria-selected="true"]')?.parentElement
  if (!el || !slot) return
  const box = el.getBoundingClientRect()
  const tab = slot.getBoundingClientRect()
  if (tab.left < box.left) el.scrollLeft -= box.left - tab.left
  else if (tab.right > box.right) el.scrollLeft += Math.min(tab.right - box.right, tab.left - box.left)
}

// エントリ 1 つのタイプと名前（ページはそのタイプ、バインダは入れるページのタイプ。参照エントリは指す先の物。指す先の行が無ければ null）
function shownOf(e: LineupEntry, { pages, folders }: Library): { type: string; title: string } | null {
  if (e.kind === "page") return { type: e.type, title: e.title }
  if (e.kind === "binder") return { type: e.pageType, title: e.title }
  const row = e.of.kind === "page" ? pages[e.of.id] : undefined
  if (row) return { type: row.type, title: row.title }
  const binder = e.of.kind === "binder" ? folders[e.of.id] : undefined
  return binder?.folderRole === "binder" ? { type: binder.pageType, title: binder.title } : null
}

export function PageTabs() {
  const opened = useStageHere(st => st?.opened ?? NOTHING_OPENED)
  const book = useMatomezuState(s => openedBook(s.books, opened))
  const openPage = useCommand(PAGE_OPEN.id)
  const openBinder = useCommand(BINDER_OPEN.id)
  const openMenu = useContextMenu(PAGE_CONTEXT)
  const openBinderMenu = useContextMenu(BINDER_CONTEXT)
  const pages = useMatomezuState(s => s.pages)
  const folders = useMatomezuState(s => s.folders)
  const icons = useUiCatalog().pageTypeIcons // タイプのアイコン（名乗らないタイプは通常のファイル）
  const t = useMessages(kit)
  const list = useRef<HTMLDivElement | null>(null)
  const lineup = book ? lineupOf(book) : []
  const tabDrag = useTabDrag(
    list,
    lineup.map(e => e.id),
    "x",
    new Set(lineup.flatMap(e => (e.kind === "binder" ? [e.id] : []))),
  )
  const shown = shownPageId(opened)
  const binder = book ? binderOf(book, opened) : NO_BINDER
  const firstType = shownType(opened)
  const selected = book && openPage.enabled ? `${book.id}/${binder !== NO_BINDER ? binder : shown}` : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: 選ばれたタブが替わったときと並びが出たときだけ送る（同じバインダの中でページを替えても、手で送った位置は戻さない）
  useLayoutEffect(() => reveal(list.current), [selected])
  if (!book || !openPage.enabled) return <div className={styles.tabs} data-page-tabs />
  const { drag } = tabDrag
  const grabbed = drag && lineup.find(e => e.id === drag.id)
  return (
    <div
      className={styles.tabs}
      data-page-tabs
      role="tablist"
      aria-label={book.title}
      ref={el => {
        list.current = el
        return sideways(el)
      }}
    >
      {lineup.map(e => {
        const look = shownOf(e, { pages, folders })
        const icon = (look && icons.get(look.type)) ?? <FileIcon />
        return (
          <span key={e.id} className={styles.slot} ref={tabDrag.slot(e.id)} data-carried={drag?.id === e.id}>
            <button
              type="button"
              role="tab"
              className={styles.tab}
              data-locked={e.kind === "page" && e.locked === true}
              data-binder={e.kind === "binder" || undefined}
              aria-selected={e.kind === "page" ? e.id === shown : e.id === binder}
              onClick={() => {
                if (tabDrag.swallowClick()) return
                if (e.kind === "binder") openBinder.run(e.id)
                else if (e.kind === "page") openPage.run(e.id)
              }}
              onContextMenu={ev => {
                if (e.kind === "page") openMenu(ev, { page: e.id })
                else if (e.kind === "binder") openBinderMenu(ev, { binder: e.id })
              }}
              {...tabDrag.handlers(e.id)}
            >
              <span className={styles.typeIcon} aria-hidden="true">
                {e.kind === "reference" ? <ReferenceIcon icon={icon} /> : icon}
              </span>
              {look?.title ?? t("No Data")}
            </button>
            {e.kind === "page" && e.locked && (
              <span className={styles.lock} role="img" aria-label={t("Locked")}>
                <LockIcon />
              </span>
            )}
          </span>
        )
      })}
      {tabDrag.bar !== null && <div className={styles.dropBar} style={{ left: tabDrag.bar }} />}
      {drag && grabbed && (
        <GhostArea>
          <div className={styles.ghost} style={{ left: drag.x - drag.grab, top: drag.y - 12 }}>
            {shownOf(grabbed, { pages, folders })?.title}
          </div>
        </GhostArea>
      )}
      <AddPageMenu first={firstType === NO_PAGE_TYPE ? null : firstType} />
    </div>
  )
}
