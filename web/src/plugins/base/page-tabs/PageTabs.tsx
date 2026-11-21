// ステージのページのタブ（ウィジェット page-tabs）: そのステージのブックの並びを並べる（エントリ 1 つが 1 つのタブ。バインダは 1 つのタブで、名前はバインダの名前）。
// 押したページをそのステージで開く（コマンド page-open）。バインダのタブを押すと、そのバインダを開く（コマンド binder-open）。＋でタイプを選んでページを作る（AddPageMenu.tsx）。
// ロック中のページのタブには鍵の印を出す（押せない。外すのはページの設定のダイアログ）。
// タブが横にあふれているときは、ホイールの縦の回転で横にスクロールする。
// タブはドラッグで並べ替えられる（useTabDrag。アクション page-move・binder-move）。掴んだタブは元の所で薄くなり、写しがポインタに付き、落とす所に線が出る
import { useRef } from "react"
import { lineupOf } from "../../../core/book"
import type { LineupEntry } from "../../../core/schema/book"
import { binderOf, openedBook, shownPageId, shownType } from "../../../core/stage"
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

// エントリ 1 つのタイプ（ページはそのタイプ、バインダは入れるページのタイプ）
const typeOf = (e: LineupEntry): string => (e.kind === "page" ? e.type : e.pageType)

export function PageTabs() {
  const opened = useStageHere(st => st?.opened)
  const book = useMatomezuState(s => openedBook(s.books, opened))
  const openPage = useCommand(PAGE_OPEN.id)
  const openBinder = useCommand(BINDER_OPEN.id)
  const openMenu = useContextMenu(PAGE_CONTEXT)
  const openBinderMenu = useContextMenu(BINDER_CONTEXT)
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
  if (!book || !openPage.enabled) return <div className={styles.tabs} data-page-tabs />
  const { drag } = tabDrag
  const grabbed = drag && lineup.find(e => e.id === drag.id)
  const shown = shownPageId(opened ?? null)
  const binder = binderOf(book, opened ?? null)
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
      {lineup.map(e => (
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
              else openPage.run(e.id)
            }}
            onContextMenu={ev => {
              if (e.kind === "page") openMenu(ev, { page: e.id })
              else openBinderMenu(ev, { binder: e.id })
            }}
            {...tabDrag.handlers(e.id)}
          >
            <span className={styles.typeIcon} aria-hidden="true">
              {icons.get(typeOf(e)) ?? <FileIcon />}
            </span>
            {e.title}
          </button>
          {e.kind === "page" && e.locked && (
            <span className={styles.lock} role="img" aria-label={t("Locked")}>
              <LockIcon />
            </span>
          )}
        </span>
      ))}
      {tabDrag.bar !== null && <div className={styles.dropBar} style={{ left: tabDrag.bar }} />}
      {drag && grabbed && (
        <GhostArea>
          <div className={styles.ghost} style={{ left: drag.x - drag.grab, top: drag.y - 12 }}>
            {grabbed.title}
          </div>
        </GhostArea>
      )}
      <AddPageMenu first={shownType(opened ?? null)} />
    </div>
  )
}
