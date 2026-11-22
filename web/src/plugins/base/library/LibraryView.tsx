// 書庫の画面: 左にツリー（書庫ホームとゴミ箱が一番上に並ぶ）、右にパンくずと、開いているフォルダの中身。
// 1 回押すと選び（ツリーのフォルダ・ブック・バインダは、右の枠にその中身を出す）、2 回押すと開く（フォルダは中へ入り、ブックとその中のページ・バインダは窓に出す）。
// ゴミ箱は、ツリーでは中を出さず、右の枠に捨てた物の一覧を出す（TrashView.tsx）。読めない物は、選べるだけ。開いているフォルダは画面の場所に入り、選んでいる行は入らない（state.ts）
import { type CSSProperties, type MouseEvent, useEffect, useId, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { type Naming, namingOf, titleOf } from "../../../core/entries"
import { HOME_ID, TRASH_ID, UNREADABLE_ID } from "../../../core/folders"
import type { MatomezuState } from "../../../store/state"
import { useCommand } from "../../../ui/commands"
import { useContextMenu, useToggledMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { usePluginState, useReadPluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { useCatalog, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useActions, useUserSetting } from "../../../ui/view-hooks"
import { ActionButton, controlClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { SplitHandle } from "../utils/SplitHandle"
import {
  LIBRARY_ADD_PAGE_MENU,
  LIBRARY_CONTENTS_SCOPE,
  LIBRARY_ENTRY_CONTEXT,
  LIBRARY_ENTRY_OPEN,
  LIBRARY_FOLDER_CONTEXT,
  LIBRARY_FOUND_SCOPE,
  LIBRARY_SCOPE,
  LIBRARY_TREE_SCOPE,
} from "./commands"
import { LIBRARY_NEW_BOOK_DIALOG, LIBRARY_NEW_FOLDER_DIALOG } from "./dialog"
import { holderForNew, holderForNewPage } from "./entries"
import { FoundView } from "./FoundView"
import { HistoryButtons } from "./HistoryButtons"
import { useKeepFocusIn, useLibraryRows, useNameOf } from "./hooks"
import { CHEVRON, RowIcon, TRASH } from "./icons"
import styles from "./LibraryView.module.css"
import { MoveClashConfirm } from "./MoveClashConfirm"
import {
  arrivedAt,
  holdsRows,
  type LibraryRow,
  NO_TITLE,
  NO_TYPE,
  openedFolderOf,
  pathTo,
  rowsIn,
  tabStopOf,
  topIdsOf,
  treeCurrentOf,
  treeRowsOf,
  unfoldable,
  unfoldedOf,
} from "./outline"
import { usePickRows } from "./RowTable"
import { SettingsClearConfirm } from "./SettingsClearConfirm"
import { type FoundRow, NO_SEARCH, searchWord } from "./search"
import { SHOW_UNREADABLE_FOLDER } from "./show-unreadable"
import { LIBRARY_FOLDER, LIBRARY_PICKED, LIBRARY_QUERY, LIBRARY_TREE_WIDTH, LIBRARY_UNFOLDED } from "./state"
import { TrashView } from "./TrashView"
import { CONTENT_MIN_WIDTH, DEFAULT_TREE_WIDTH, TREE_MIN_WIDTH, treeWidthAt } from "./tree-width"
import { UnreadableView } from "./UnreadableView"
import { type LibraryDrag, useLibraryDrag } from "./useLibraryDrag"

// 一番上に並ぶフォルダの行（書庫ホームとゴミ箱と、設定がオンなら読めない物のフォルダ。名前は画面が付ける）
const topRowsOf = (unreadableShown: boolean): readonly LibraryRow[] =>
  topIdsOf(unreadableShown).map(id => ({
    kind: "folder",
    id,
    title: NO_TITLE,
    type: NO_TYPE,
    readable: true,
    locked: false,
  }))
const TOPS = topRowsOf(false)
const TOPS_WITH_UNREADABLE = topRowsOf(true)

// フォルダ folder の直下の行
const useRowsIn = (folder: string): readonly LibraryRow[] =>
  useLibraryRows(folder, (s, naming) => rowsIn(s, folder, naming))

interface Handlers {
  opened: string
  picked: string | undefined
  shown: ReadonlySet<string> // 中を出しているフォルダ
  toggle(id: string): void
  enter(folder: string): void // フォルダの中身を右の枠に出す
  pick(row: LibraryRow, holder: string): void
  open(row: LibraryRow): void
  menu(e: MouseEvent, row: LibraryRow): void // 行の右クリックのメニューを開く
  drag: LibraryDrag | null
  tabbable: string // ツリーで Tab で止まる行（今いる行。ツリーに出ていなければ書庫ホーム）
}

// className: 置く側が足す見た目（置き場所の余白に合わせた広げ方など）
export function LibraryView({ className }: { className?: string } = {}) {
  // 根の要素: 焦点のある行が消えたとき、ここへ焦点を置き直す（書庫のキーが効き続けるように）
  const root = useRef<HTMLDivElement>(null)
  useKeepFocusIn(root)
  const t = useMessages(kit)
  const nameOf = useNameOf()
  const read = useReadState()
  const openEntry = useCommand(LIBRARY_ENTRY_OPEN.id).run
  const value = usePluginState(kit, LIBRARY_FOLDER)
  const setFolder = useSetPluginState(kit, LIBRARY_FOLDER)
  const picked = usePluginState(kit, LIBRARY_PICKED)
  const setPicked = useSetPluginState(kit, LIBRARY_PICKED)
  const opened = useMatomezuState(s => openedFolderOf(s.folders, value))
  const path = useMatomezuState(useShallow(s => pathTo(s.folders, opened)))
  const catalog = useCatalog().core
  const titles = useMatomezuState(useShallow(s => path.map(id => folderTitle(s, id, namingOf(catalog, s.settings)))))
  const rows = useRowsIn(opened)
  const unreadableShown = useUserSetting(SHOW_UNREADABLE_FOLDER.id) === true
  // 読めない物のフォルダの直下の物の数（在る間は、設定がオフでも、ツリーの下に出して開けるようにする）
  const unreadableCount = useMatomezuState(s => s.unreadableFolder.length)
  const pick = usePickRows(
    rows.map(r => r.id),
    picked,
    setPicked,
  )
  // 新しいブック・フォルダを作る先（開いているのがブック・バインダなら、それを入れているフォルダ。ゴミ箱なら無い）
  const into = useMatomezuState(s => holderForNew(s.folders, opened))
  const pageInto = useMatomezuState(s => holderForNewPage(s.folders, opened))
  const addPageMenu = useToggledMenu(LIBRARY_ADD_PAGE_MENU)
  const addPage = useRef<HTMLSpanElement>(null)
  const { openDialog } = useActions()
  const unfolded = unfoldedOf(usePluginState(kit, LIBRARY_UNFOLDED))
  const setUnfolded = useSetPluginState(kit, LIBRARY_UNFOLDED)
  const readUnfolded = useReadPluginState(kit, LIBRARY_UNFOLDED)
  const shown = new Set(unfolded)
  // 行へ移る: 開くフォルダ・選ぶ行・ツリーで中を出すフォルダを置き直す
  const arrive = (row: { id: string; holder: string; holds: boolean }) => {
    const next = arrivedAt(read().folders, row, unfolded)
    if (next.folder !== opened) setFolder(next.folder)
    setPicked(next.picked)
    if (next.unfolded !== unfolded) setUnfolded([...next.unfolded])
  }
  const enter = (folder: string) => arrive({ id: folder, holder: folder, holds: true })
  // 検索: 入力Formに打っている途中の言葉 typed と、「検索」を押して探している言葉 query
  const query = usePluginState(kit, LIBRARY_QUERY)
  const treeWidth = usePluginState(kit, LIBRARY_TREE_WIDTH) ?? DEFAULT_TREE_WIDTH
  const setTreeWidth = useSetPluginState(kit, LIBRARY_TREE_WIDTH)
  const setQuery = useSetPluginState(kit, LIBRARY_QUERY)
  const [typed, setTyped] = useState(query ?? "")
  const searchForm = useId()
  // 読めない物のフォルダを開く（ツリーの下の ⚠ の行）: 検索していればやめ、選んでいる行も外す
  const openUnreadable = () => {
    setQuery(undefined)
    setTyped("")
    enter(UNREADABLE_ID)
  }
  // 検索の結果を押した回数: 同じ行を押し直しても、ツリーをその行まで送り直す
  const [reveals, setReveals] = useState(0)
  const reveal = (row: FoundRow) => {
    arrive({ id: row.id, holder: row.holder, holds: holdsRows(row) })
    setReveals(n => n + 1)
  }
  const openEntryMenu = useContextMenu(LIBRARY_ENTRY_CONTEXT)
  const openFolderMenu = useContextMenu(LIBRARY_FOLDER_CONTEXT)
  const { drag, asking, clearing, onPointerDown, answered, cleared } = useLibraryDrag(root, id => {
    const now = unfoldedOf(readUnfolded())
    if (!now.includes(id) && read().folders[id] !== undefined && id !== TRASH_ID) setUnfolded([...now, id])
  })
  // Tab で止まる行: ツリーは今いる行（出ていなければ書庫ホーム）、右の枠は選んでいる行（無ければ最初の行）
  const current = useMatomezuState(st => treeCurrentOf(st.folders, opened, picked))
  const treeStop = useMatomezuState(
    st =>
      tabStopOf(
        treeRowsOf(st.folders, unfolded, unreadableShown).map(r => r.id),
        current,
        HOME_ID,
      ) ?? HOME_ID,
  )
  const handlers: Handlers = {
    drag,
    menu: (e, row) => openEntryMenu(e, { entry: row.id, pressed: { x: e.clientX, y: e.clientY } }),
    opened,
    picked,
    shown,
    toggle: id => setUnfolded(shown.has(id) ? unfolded.filter(x => x !== id) : [...unfolded, id]),
    enter,
    pick: (row, holder) => arrive({ id: row.id, holder, holds: false }),
    // 開く（フォルダは中へ入る）のは、Enter・右クリックのメニューと同じコマンド
    open: row => openEntry({ entry: row.id }),
    tabbable: treeStop,
  }
  // キーで選ぶ行が変わったら、焦点もその行へ移す（ツリー・検索の結果の中に焦点があればツリーの今いる行へ、右の枠の中身の中に在れば選んでいる行へ）。
  // 行のボタンは、入っている所の範囲を自分で名乗る
  useEffect(() => {
    const at = document.activeElement
    const scope = at instanceof HTMLElement ? at.closest<HTMLElement>("[data-key-scope]")?.dataset.keyScope : undefined
    const id =
      scope === LIBRARY_TREE_SCOPE || scope === LIBRARY_FOUND_SCOPE
        ? current
        : scope === LIBRARY_CONTENTS_SCOPE
          ? picked
          : undefined
    if (id === undefined) return
    const to = [
      ...(root.current?.querySelectorAll<HTMLElement>(`[data-library-row][data-key-scope="${scope}"]`) ?? []),
    ].find(r => r.dataset.libraryRow === id)
    if (to && to !== at) to.focus()
  }, [current, picked])
  // ツリーで今いる行が変わったら（パンくずで移ったなど）と、検索の結果を押すたびに、その行が見える所までツリーを送る（見えていれば動かさない）
  // biome-ignore lint/correctness/useExhaustiveDependencies: reveals は検索の結果を押し直したときにも送るための合図
  useEffect(() => {
    const row = root.current?.querySelector<HTMLElement>(
      `[data-library-row="${CSS.escape(current)}"][data-key-scope="${LIBRARY_TREE_SCOPE}"]`,
    )
    row?.scrollIntoView({ block: "nearest" })
  }, [current, reveals])
  const here = nameOf({ id: opened, title: titles[titles.length - 1] ?? NO_TITLE })
  return (
    <div
      ref={root}
      className={className === undefined ? styles.library : `${styles.library} ${className}`}
      data-key-scope={LIBRARY_SCOPE}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      style={
        {
          "--library-tree-width": `${treeWidth}px`,
          "--library-tree-min-width": `${TREE_MIN_WIDTH}px`,
          "--library-content-min-width": `${CONTENT_MIN_WIDTH}px`,
        } as CSSProperties
      }
    >
      <div className={styles.left}>
        <search>
          <form
            id={searchForm}
            className={styles.search}
            onSubmit={e => {
              e.preventDefault()
              setQuery(searchWord(typed) === NO_SEARCH ? undefined : typed.trim())
            }}
          >
            <input
              className={controlClass}
              aria-label={t("Search by name")}
              placeholder={t("Search by name")}
              value={typed}
              onChange={e => {
                setTyped(e.target.value)
                // 入力Formを空にしたら、元の表示に戻す
                if (e.target.value === "") setQuery(undefined)
              }}
            />
            <ActionButton form={searchForm} raised>
              {t("Search")}
            </ActionButton>
          </form>
        </search>
        <nav className={styles.tree} aria-label={t("Folders")} data-key-scope={LIBRARY_TREE_SCOPE}>
          <ul className={styles.rows}>
            {(unreadableShown ? TOPS_WITH_UNREADABLE : TOPS).map(top => (
              <TreeNode key={top.id} row={top} holder={top.id} depth={0} handlers={handlers} />
            ))}
          </ul>
        </nav>
        {unreadableCount > 0 && (
          <button type="button" className={styles.unreadableNotice} onClick={openUnreadable}>
            {t("⚠ Unreadable: {count}", { count: unreadableCount })}
          </button>
        )}
      </div>
      <SplitHandle
        direction="row"
        frame={root}
        onMove={(at, length) => setTreeWidth(treeWidthAt(at, length))}
        onReset={() => setTreeWidth(undefined)}
        className={styles.treeSplitter}
        data-tree-splitter
      />
      <div className={styles.right}>
        {query !== undefined ? (
          <FoundView
            key={query}
            query={query}
            current={current}
            onPick={reveal}
            onOpen={handlers.open}
            onMenu={(e, row) => {
              reveal(row)
              handlers.menu(e, row)
            }}
          />
        ) : (
          <>
            <nav className={styles.path} aria-label={t("Where it is")}>
              {path.map((id, i) => (
                <span key={id}>
                  {i > 0 && <span className={styles.sep}>›</span>}
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
            {opened !== TRASH_ID && opened !== UNREADABLE_ID && (
              <div className={styles.tools}>
                {into !== undefined && (
                  <>
                    <ActionButton raised onClick={() => openDialog(LIBRARY_NEW_BOOK_DIALOG.id, { into })}>
                      <span className={styles.create}>
                        <RowIcon row={{ kind: "book", type: NO_TYPE }} className={styles.icon} />
                        {t("Create book")}
                      </span>
                    </ActionButton>
                    <ActionButton raised onClick={() => openDialog(LIBRARY_NEW_FOLDER_DIALOG.id, { into })}>
                      <span className={styles.create}>
                        <RowIcon row={{ kind: "folder", type: NO_TYPE }} className={styles.icon} />
                        {t("New folder")}
                      </span>
                    </ActionButton>
                  </>
                )}
                {pageInto !== undefined && (
                  <span ref={addPage} onPointerDown={addPageMenu.pressed}>
                    <ActionButton
                      raised
                      onClick={() => {
                        const r = addPage.current?.getBoundingClientRect()
                        if (r) addPageMenu.open({ x: r.left, y: r.bottom + 4 }, { folder: pageInto })
                      }}
                    >
                      <span className={styles.create}>
                        <RowIcon row={{ kind: "page", type: NO_TYPE }} className={styles.icon} />
                        {t("Create page")}
                      </span>
                    </ActionButton>
                  </span>
                )}
                <HistoryButtons />
              </div>
            )}
            {opened === TRASH_ID ? (
              <TrashView picked={picked} onPick={setPicked} />
            ) : opened === UNREADABLE_ID ? (
              <UnreadableView picked={picked} onPick={setPicked} />
            ) : rows.length === 0 ? (
              <p
                className={styles.blank}
                onContextMenu={e => openFolderMenu(e, { folder: opened, pressed: { x: e.clientX, y: e.clientY } })}
              >
                {t("Nothing inside")}
              </p>
            ) : (
              <ul
                className={styles.contents}
                aria-label={t("Contents of {name}", { name: here })}
                onContextMenu={e => openFolderMenu(e, { folder: opened, pressed: { x: e.clientX, y: e.clientY } })}
                // ドラッグのあとの click は、useLibraryDrag が止める
                {...pick.list}
              >
                {rows.map(row => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={styles.entry}
                      {...pick.row(row.id)}
                      data-holder={opened}
                      {...dragMarks(drag, LIBRARY_CONTENTS_SCOPE, row.id)}
                      onDoubleClick={() => handlers.open(row)}
                      onContextMenu={e => {
                        setPicked(row.id)
                        handlers.menu(e, row)
                      }}
                    >
                      <RowIcon row={row} className={styles.bigIcon} />
                      <span className={row.readable ? styles.caption : `${styles.caption} ${styles.unreadable}`}>
                        {nameOf(row)}
                      </span>
                      {!row.readable && <span className={styles.note}>{t("Cannot be read")}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {asking && <MoveClashConfirm asking={asking} onDone={answered} />}
      {clearing && <SettingsClearConfirm clearing={clearing} onDone={cleared} />}
    </div>
  )
}

// ドラッグ中の行の印: 掴んだ行（data-dragging）と、落とす所の行（data-drop に、中へ・前・後ろ）
const dragMarks = (drag: LibraryDrag | null, zone: string, row: string) => ({
  "data-dragging": drag?.id === row ? true : undefined,
  "data-drop": drag?.aim?.zone === zone && drag.aim.row === row ? drag.aim.where : undefined,
})

// フォルダ id の名前（名前を持たない物・無い物は NO_TITLE）
const folderTitle = (s: MatomezuState, id: string, naming: Naming): string =>
  titleOf(s, "folder", id, naming) ?? NO_TITLE

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
  const unfolds = unfoldable(row.id, holds)
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
          data-library-row={row.id}
          data-key-scope={LIBRARY_TREE_SCOPE}
          tabIndex={row.id === handlers.tabbable ? 0 : -1}
          data-holder={holder}
          {...dragMarks(handlers.drag, LIBRARY_TREE_SCOPE, row.id)}
          aria-current={holds && row.id === handlers.opened ? "true" : undefined}
          aria-pressed={!holds && row.id === handlers.picked}
          onClick={() => (holds ? handlers.enter(row.id) : handlers.pick(row, holder))}
          onDoubleClick={() => handlers.open(row)}
          onContextMenu={e => {
            if (row.id !== TRASH_ID && row.id !== UNREADABLE_ID) handlers.menu(e, row)
          }}
        >
          {row.id === TRASH_ID ? (
            <span className={styles.icon}>{TRASH}</span>
          ) : (
            <RowIcon row={row} className={styles.icon} open={open} />
          )}
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
