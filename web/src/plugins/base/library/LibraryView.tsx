// 書庫の画面: 左にツリー（書庫ホームとゴミ箱が一番上に並ぶ）、右にパンくずと、開いているフォルダの中身。
// 1 回押すと選び（ツリーのフォルダ・ブック・バインダは、右の枠にその中身を出す）、2 回押すと開く（フォルダは中へ入り、ブックとその中のページ・バインダは窓に出す）。
// ゴミ箱は、ツリーでは中を出さず、右の枠に捨てた物の一覧を出す（TrashView.tsx）。読めない物は、選べるだけ。開いているフォルダは画面の場所に入り、選んでいる行は入らない（state.ts）
import { type KeyboardEvent, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { titleOf } from "../../../core/entries"
import { HOME_ID, TRASH_ID } from "../../../core/folders"
import { NO_STAGE } from "../../../store/dialogs"
import type { MatomezuState } from "../../../store/store"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { useActions, usePluginState, useSetPluginState } from "../../../ui/view-hooks"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { LIBRARY_SCOPE } from "./commands"
import { LIBRARY_NEW_BOOK_DIALOG, LIBRARY_NEW_FOLDER_DIALOG } from "./dialog"
import { holderForNew } from "./entries"
import { HistoryButtons } from "./HistoryButtons"
import { useKeepFocusIn, useLibraryRows, useNameOf } from "./hooks"
import { CHEVRON, iconOf, TRASH } from "./icons"
import styles from "./LibraryView.module.css"
import {
  holdsRows,
  type LibraryRow,
  NO_TITLE,
  NO_TYPE,
  NOT_OPENED,
  openedFolderOf,
  openTargetOf,
  pathTo,
  rowsIn,
  unfoldedOf,
} from "./outline"
import { LIBRARY_FOLDER, LIBRARY_PICKED, LIBRARY_UNFOLDED } from "./state"
import { TrashView } from "./TrashView"

// 一番上に並ぶフォルダの行（書庫ホームとゴミ箱。名前は画面が付ける）
const TOPS: readonly LibraryRow[] = [HOME_ID, TRASH_ID].map(id => ({
  kind: "folder",
  id,
  title: NO_TITLE,
  type: NO_TYPE,
  readable: true,
}))

// フォルダ folder の直下の行
const useRowsIn = (folder: string): readonly LibraryRow[] => useLibraryRows(folder, s => rowsIn(s, folder))

interface Handlers {
  opened: string
  picked: string | undefined
  shown: ReadonlySet<string> // 中を出しているフォルダ
  toggle(id: string): void
  enter(folder: string): void // フォルダの中身を右の枠に出す
  pick(row: LibraryRow, holder: string): void
  open(row: LibraryRow): void
}

export function LibraryView() {
  // 根の要素: 焦点のある行が消えたとき、ここへ焦点を置き直す（書庫のキーが効き続けるように）
  const root = useRef<HTMLDivElement>(null)
  useKeepFocusIn(root)
  const t = useMessages(kit)
  const nameOf = useNameOf()
  const read = useReadState()
  const actions = useStoreActions()
  const value = usePluginState(kit, LIBRARY_FOLDER)
  const setFolder = useSetPluginState(kit, LIBRARY_FOLDER)
  const picked = usePluginState(kit, LIBRARY_PICKED)
  const setPicked = useSetPluginState(kit, LIBRARY_PICKED)
  const opened = useMatomezuState(s => openedFolderOf(s.folders, value))
  const path = useMatomezuState(useShallow(s => pathTo(s.folders, opened)))
  const titles = useMatomezuState(useShallow(s => path.map(id => folderTitle(s, id))))
  const rows = useRowsIn(opened)
  // 新しいブック・フォルダを作る先（開いているのがブック・バインダなら、それを入れているフォルダ。ゴミ箱なら無い）
  const into = useMatomezuState(s => holderForNew(s.folders, opened))
  const { openDialog } = useActions()
  const unfolded = unfoldedOf(usePluginState(kit, LIBRARY_UNFOLDED))
  const setUnfolded = useSetPluginState(kit, LIBRARY_UNFOLDED)
  const shown = new Set(unfolded)
  const enter = (folder: string) => {
    if (folder !== opened) setFolder(folder)
    setPicked(undefined)
    // 入ったフォルダまでの道は、ツリーの中を出す
    const over = pathTo(read().folders, folder).slice(0, -1)
    if (over.some(id => !shown.has(id))) setUnfolded([...new Set([...unfolded, ...over])])
  }
  const handlers: Handlers = {
    opened,
    picked,
    shown,
    toggle: id => setUnfolded(shown.has(id) ? unfolded.filter(x => x !== id) : [...unfolded, id]),
    enter,
    pick: (row, holder) => {
      if (holder !== opened) setFolder(holder)
      setPicked(row.id)
    },
    open: row => {
      const target = openTargetOf(read(), row)
      if (target === NOT_OPENED) return
      if (target.to === "folder") return enter(target.folder)
      const stage = actions.showBookStage(target.book, target.page)
      if (stage !== NO_STAGE && target.binder !== undefined) actions.openBinder(stage, target.binder)
    },
  }
  const here = nameOf({ id: opened, title: titles[titles.length - 1] ?? NO_TITLE })
  return (
    <div ref={root} className={styles.library} data-key-scope={LIBRARY_SCOPE} tabIndex={-1}>
      <nav className={styles.tree} aria-label={t("Folders")}>
        <ul className={styles.rows}>
          {TOPS.map(top => (
            <TreeNode key={top.id} row={top} holder={top.id} depth={0} handlers={handlers} />
          ))}
        </ul>
      </nav>
      <div className={styles.right}>
        <nav className={styles.path} aria-label={t("Where it is")}>
          {path.map((id, i) => (
            <span key={id}>
              {i > 0 && <span className={styles.sep}> › </span>}
              <button
                type="button"
                className={styles.crumb}
                aria-current={id === opened ? "true" : undefined}
                onClick={() => enter(id)}
              >
                {nameOf({ id, title: titles[i] ?? NO_TITLE })}
              </button>
            </span>
          ))}
        </nav>
        {opened !== TRASH_ID && (
          <div className={styles.tools}>
            {into !== undefined && (
              <>
                <ActionButton onClick={() => openDialog(LIBRARY_NEW_BOOK_DIALOG.id, { into })}>
                  {t("Create book")}
                </ActionButton>
                <ActionButton onClick={() => openDialog(LIBRARY_NEW_FOLDER_DIALOG.id, { into })}>
                  {t("New folder")}
                </ActionButton>
              </>
            )}
            <HistoryButtons />
          </div>
        )}
        {opened === TRASH_ID ? (
          <TrashView picked={picked} onPick={setPicked} />
        ) : rows.length === 0 ? (
          <p className={styles.empty}>{t("Nothing inside")}</p>
        ) : (
          <ul className={styles.contents} aria-label={t("Contents of {name}", { name: here })}>
            {rows.map(row => (
              <li key={row.id}>
                <button
                  type="button"
                  className={styles.entry}
                  aria-pressed={row.id === picked}
                  onClick={() => setPicked(row.id)}
                  onDoubleClick={() => handlers.open(row)}
                  onKeyDown={e => openOnEnter(e, () => handlers.open(row))}
                >
                  <span className={styles.bigIcon}>{iconOf(row.kind)}</span>
                  <span className={row.readable ? styles.caption : `${styles.caption} ${styles.unreadable}`}>
                    {nameOf(row)}
                  </span>
                  {!row.readable && <span className={styles.note}>{t("Cannot be read")}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// 行のボタンの上の Enter は、押す（選ぶ）代わりに開く（2 回押すのと同じ）
const openOnEnter = (e: KeyboardEvent, open: () => void) => {
  if (e.key !== "Enter" || e.nativeEvent.isComposing) return
  e.preventDefault()
  open()
}

// フォルダ id の名前（名前を持たない物・無い物は NO_TITLE）
const folderTitle = (s: MatomezuState, id: string): string => titleOf(s, "folder", id) ?? NO_TITLE

// ツリーの 1 行と、中を出していればその下の行
function TreeNode({
  row,
  holder,
  depth,
  handlers,
}: {
  row: LibraryRow
  holder: string
  depth: number
  handlers: Handlers
}) {
  const t = useMessages(kit)
  const nameOf = useNameOf()
  const name = nameOf(row)
  const holds = holdsRows(row)
  // ゴミ箱の中は、ツリーに出さない
  const unfolds = holds && row.id !== TRASH_ID
  const open = unfolds && handlers.shown.has(row.id)
  return (
    <li>
      <div className={styles.node} style={{ paddingLeft: depth * 14 }}>
        {unfolds ? (
          <button
            type="button"
            className={styles.toggle}
            data-open={open}
            aria-expanded={open}
            aria-label={t(open ? "Hide what is inside {name}" : "Show what is inside {name}", { name })}
            onClick={() => handlers.toggle(row.id)}
          >
            <span className={styles.mark}>{CHEVRON}</span>
          </button>
        ) : (
          <span className={styles.toggle} />
        )}
        <button
          type="button"
          className={styles.name}
          aria-current={holds && row.id === handlers.opened ? "true" : undefined}
          aria-pressed={!holds && row.id === handlers.picked}
          onClick={() => (holds ? handlers.enter(row.id) : handlers.pick(row, holder))}
          onDoubleClick={() => handlers.open(row)}
          onKeyDown={e => openOnEnter(e, () => handlers.open(row))}
        >
          <span className={styles.icon}>{row.id === TRASH_ID ? TRASH : iconOf(row.kind)}</span>
          <span className={row.readable ? styles.label : `${styles.label} ${styles.unreadable}`}>{name}</span>
        </button>
      </div>
      {open && <TreeRows folder={row.id} depth={depth + 1} handlers={handlers} />}
    </li>
  )
}

function TreeRows({ folder, depth, handlers }: { folder: string; depth: number; handlers: Handlers }) {
  const rows = useRowsIn(folder)
  if (rows.length === 0) return null
  return (
    <ul className={styles.rows}>
      {rows.map(row => (
        <TreeNode key={row.id} row={row} holder={folder} depth={depth} handlers={handlers} />
      ))}
    </ul>
  )
}
