// 書庫の画面のコマンド: 選んでいる物（右クリックのメニューからは右クリックした物、ツリーのキーからはツリーで今いる行）を開く・名前を変える・ゴミ箱に入れる、中にブック・フォルダを作る、
// ドラッグで落とした物を動かす、矢印キーでツリーの行・右の枠の隣の行へ移る、書庫の履歴を元に戻す・やり直す（library-revert で、最後の画面の履歴の段が変えた所を置き直す）。
// キーは、書庫の画面（LibraryView）の中に焦点がある間だけ効く（キーの範囲 library。矢印・F2・Delete は、ツリーの中 library-tree と、右の枠の中身の中 library-contents。
// 行の外（余白）に焦点がある間は、矢印だけが効く（library-tree-around・library-contents-around）。
// F2・Delete をツリーと重ならない範囲に置くのは、ツリーで止められたキーが外の範囲へ落ちて、右の枠で選んでいる別の行に効かないように）。
// 置き直しても何も変わらない段は、動かして飛ばし、その次の段を置き直す。断られたらトーストで知らせる。その間のほかの変更とぶつかって断られた（土台かアクションが断った）なら、
// 2 行目にそう出し、その画面の履歴の段を捨てる（次はその前の段を置き直す）。認可ステップが止めた（ロック中など）なら、その画面の履歴の段は動かさない

import type { CoreCatalog } from "../../../core/core-catalog"
import { ANY_PAGE_TYPE } from "../../../core/def/action"
import { namingOf, placeOf, rowTitle } from "../../../core/entries"
import type { Folders } from "../../../core/folders"
import { isKeptSystemFolder, systemFolderOf } from "../../../core/folders-tree"
import type { Point } from "../../../core/geom"
import { LIBRARY_HISTORY } from "../../../core/history"
import {
  type CommandActions,
  type ScreenCommandContext,
  tryPerformOf,
  unreadableItemsIn,
} from "../../../store/commands/def"
import { NO_CONTEXT_MENU } from "../../../store/context-menus"
import { BOOK_CREATE } from "../book-new/book-create"
import { dropClashing, notRestored } from "../history"
import { isRevertUnchanged } from "../history/restore"
import { kit } from "../kit"
import { type Workdesk, workdesksOf, workdesksReadsOf } from "../participant/workdesks"
import { refusalMessage } from "../utils/refusal"
import { LIBRARY_NEW_BOOK_DIALOG, LIBRARY_NEW_FOLDER_DIALOG, LIBRARY_RENAME_DIALOG } from "./dialog"
import type { Drop } from "./drop"
import {
  holderForNew,
  holderForNewPage,
  holdsEntries,
  placedInBook,
  placedOutsideBooks,
  placedOutsideTrash,
} from "./entries"
import { ENTRY_DUPLICATE } from "./entry-duplicate"
import { ENTRY_MOVE, ENTRY_MOVE_OVER, ENTRY_RENAME, FOLDER_CREATE } from "./entry-move"
import { ENTRY_TRASH } from "./entry-trash"
import { openFromLibrary } from "./open-from"
import {
  arrivedAt,
  NOT_OPENED,
  type OpenTarget,
  openedFolderOf,
  openTargetOf,
  paneIdsOf,
  type TreeRow,
  treeCurrentOf,
  treeRowsOf,
  unfoldedOf,
} from "./outline"
import { PAGE_CREATE } from "./page-create"
import { LIBRARY_REVERT, libraryRevertArgs } from "./revert"
import { unreadableShownIn } from "./show-unreadable"
import { LIBRARY_COLUMNS, LIBRARY_FOLDER, LIBRARY_PICKED, LIBRARY_QUERY, LIBRARY_UNFOLDED } from "./state"
import { createdIn, isDeskRow, realOf } from "./workdesk-rows"

// 作る物を問うときの名前（名前は問いに渡らない。行う前は許可スコープから出した所で問い、run を呼ばない。作るブックは空のブックで問う。定義と機能台帳の「認可ステップ」）
const ASKED_TITLE = "-"

// 書庫の履歴の最後の段を、from の向きに置き直す（ステージエントリの画面の履歴の restore と同じ決まり。plugins/base/history/index.ts）
function restore(ctx: ScreenCommandContext, a: CommandActions, from: "undo" | "redo"): void {
  const to = from === "undo" ? "before" : "after"
  const steps = [...ctx.libraryHistory[from]].reverse()
  for (const [i, step] of steps.entries()) {
    const result = a.perform(LIBRARY_REVERT.id, libraryRevertArgs(step, to))
    if (!result.ok && !isRevertUnchanged(result)) {
      notRestored(ctx, a, LIBRARY_HISTORY, from, result, { clash: kit.message("Clashes with other changes") })
      if (result.reason === "refused")
        dropClashing(a, LIBRARY_HISTORY, from, steps.slice(i + 1), s =>
          tryPerformOf(a)(LIBRARY_REVERT.id, libraryRevertArgs(s, to)),
        )
      return
    }
    a.moveHistory(LIBRARY_HISTORY, from)
    if (result.ok) return
  }
}

export const LIBRARY_UNDO = kit.defineScreenCommand({
  id: "library-undo",
  readsSubjects: workdesksReadsOf,
  title: "Undo in the library",
  performs: [LIBRARY_REVERT.id],
  run: (ctx, a) => restore(ctx, a, "undo"),
  when: () => true,
  enabled: ctx => ctx.libraryHistory.undo.length > 0,
})

export const LIBRARY_REDO = kit.defineScreenCommand({
  id: "library-redo",
  readsSubjects: workdesksReadsOf,
  title: "Redo in the library",
  performs: [LIBRARY_REVERT.id],
  run: (ctx, a) => restore(ctx, a, "redo"),
  when: () => true,
  enabled: ctx => ctx.libraryHistory.redo.length > 0,
})

// 書庫の画面の右クリックのメニュー: 行（ツリーの行・右の枠のアイコン）のメニューと、右の枠の何も無い所のメニュー（受け取るのは、開いているフォルダ）
export const LIBRARY_ENTRY_CONTEXT = kit.name("library-entry-context")
export const LIBRARY_FOLDER_CONTEXT = kit.name("library-folder-context")
// 「ページ新規作成」を押して開く、ページのタイプの一覧のメニュー（受け取るのは、作る先のフォルダ。行はメニューが自分で出す）
export const LIBRARY_ADD_PAGE_MENU = kit.name("library-add-page-menu")
// LibraryView が開くメニュー（LibraryView を描くウィジェットが、contextMenus に書く）
export const LIBRARY_CONTEXT_MENUS = [LIBRARY_ENTRY_CONTEXT, LIBRARY_FOLDER_CONTEXT, LIBRARY_ADD_PAGE_MENU] as const
// 右クリックした物を受け取るメニュー
const NAMING_MENUS: readonly string[] = [LIBRARY_ENTRY_CONTEXT, LIBRARY_FOLDER_CONTEXT]

// コマンドが受け取る物: エントリ entry か、フォルダ folder（何も無い所のメニューから）か、ツリーで今いる行（at）。
// 書庫の右クリックのメニューが受け取る物も、この形（pressed は、メニューを開いた画面の位置。続けてメニューを開くコマンドが使う）
type Named = ({ entry: string } | { folder: string } | { at: "tree" }) & { pressed?: Point }

// 名指した物 named。無ければ、開いている書庫の右クリックのメニューが受け取った物
function given(ctx: ScreenCommandContext, named: Named | undefined): Named | undefined {
  if (named) return named
  const menu = ctx.contextMenu
  return menu !== NO_CONTEXT_MENU && NAMING_MENUS.includes(menu.id) ? (menu.target as Named) : undefined
}

// 作業机（コマンドは readsSubjects に workdesksReadsOf を書き、その種類を読む）
const desksIn = (ctx: ScreenCommandContext): readonly Workdesk[] => workdesksOf(ctx.catalog, ctx.read, ctx.folders)

const openedIn = (ctx: ScreenCommandContext): string =>
  openedFolderOf(ctx.folders, ctx.pluginState(LIBRARY_FOLDER), desksIn(ctx))

// コマンドが扱うエントリ: 受け取ったエントリ・フォルダ。ツリーからなら、ツリーで今いる行。何も受け取らなければ、呼ばれた場所の書庫の画面で選んでいる行（無ければ、扱う物は無い）
function entryOf(ctx: ScreenCommandContext, named?: Named): string | undefined {
  const to = given(ctx, named)
  const picked = ctx.pluginState(LIBRARY_PICKED)
  if (!to) return picked
  return "entry" in to
    ? to.entry
    : "folder" in to
      ? to.folder
      : treeCurrentOf(ctx.folders, openedIn(ctx), picked, desksIn(ctx))
}

// コマンドが扱う、受け取ったエントリ（フォルダを受け取ったとき（何も無い所のメニュー）は、扱わない。そのフォルダは、右クリックした物でない）のうち、
// in が扱うと答えた物: 名前を変える物はゴミ箱の外のどこに在っても（placedOutsideTrash）、ゴミ箱に入れる物は書庫ホームかフォルダの直下に在る物（placedOutsideBooks）、
// 写す物はブックかバインダの中か、書庫ホームかフォルダの直下のページ・バインダ（duplicates）
type Handles = (folders: Folders, entry: string, catalog: CoreCatalog) => unknown
const handled = (ctx: ScreenCommandContext, handles: Handles, named?: Named): string | undefined => {
  const to = given(ctx, named)
  const entry = to && "folder" in to ? undefined : entryOf(ctx, named)
  return entry !== undefined && handles(ctx.folders, entry, ctx.catalog) ? entry : undefined
}

// 名前を変える物: ゴミ箱の外のどこかに在る物（システムフォルダは名前を変えられない）
const renames: Handles = (folders, entry) =>
  placedOutsideTrash(folders, entry) !== undefined && systemFolderOf(folders[entry]) === undefined
// ゴミ箱に入れる物: 書庫ホームかフォルダの直下に在る物（システムフォルダは、定義が機能台帳に無い間だけ）
const trashes: Handles = (folders, entry, catalog) =>
  placedOutsideBooks(folders, entry) !== undefined && !isKeptSystemFolder(folders, entry, catalog.systemFolders)

// 右クリックのメニューの行を出すか: 受け取った物から found が扱う物を見つけるときだけ。メニューの行は、閉じてから受け取った物を名指して呼び、
// キーからは、押してから扱う物を決める（ツリーのキーは、ツリーで今いる行を名指す）ので、メニューが何も受け取っていなければ、いつも出す
const inMenu =
  (found: (ctx: ScreenCommandContext) => unknown) =>
  (ctx: ScreenCommandContext): boolean =>
    given(ctx, undefined) === undefined || found(ctx) !== undefined
const inMenuHandled = (handles: Handles) => inMenu(ctx => handled(ctx, handles))

// 新しいブック・フォルダを作る先のフォルダ: エントリを受け取ったら、それが書庫ホームかフォルダのとき、その中。
// フォルダを受け取ったら（何も無い所のメニュー）、ボタンと同じに、それがブック・バインダなら、それを入れているフォルダ。
// 作業机とその下の行なら、ボタンと同じにワークルームのフォルダ（作れないので、認可ステップに止められる）
const holder = (ctx: ScreenCommandContext, named?: Named): string | undefined => {
  const to = given(ctx, named)
  if (to && "folder" in to) return holderForNew(ctx.folders, createdIn(ctx.folders, to.folder))
  const entry = entryOf(ctx, named)
  if (entry !== undefined && isDeskRow(entry)) return holderForNew(ctx.folders, createdIn(ctx.folders, entry))
  return entry !== undefined && holdsEntries(ctx.folders, entry) ? entry : undefined
}

// 開く行き先（フォルダは中へ入る。表に行の無い物・ゴミ箱の中の物は開かない）
function opening(ctx: ScreenCommandContext, named?: Named): Exclude<OpenTarget, typeof NOT_OPENED> | undefined {
  const to = given(ctx, named)
  const entry = to && "folder" in to ? undefined : entryOf(ctx, named)
  if (entry === undefined) return undefined
  const desks = desksIn(ctx)
  // 作業机とその下の行は、実の物の種類で開く（作業机・実の物が無い行は、フォルダとして）
  const real = realOf(desks, ctx.folders, entry)
  const kind = placeOf(ctx.folders, real)?.ref.kind ?? (isDeskRow(entry) ? "folder" : undefined)
  if (kind === undefined) return undefined
  const readable = isDeskRow(entry) || kind === "page" || entry in ctx.folders
  const target = openTargetOf(ctx.folders, { id: entry, kind, readable }, desks)
  return target === NOT_OPENED ? undefined : target
}

// 開く: フォルダは右の枠で中へ入り、ブック・ページ・バインダ・ブックの外のページは窓に出す（書庫の画面の行を 2 回押す・Enter・右クリックのメニューの「開く」の、ただ 1 つの道）。
// 右クリックのメニューでは、受け取った物がフォルダでなく開けるときだけ出す。名指して呼ぶときは when が引数を受けないので、メニューの外ではいつも出す
export const LIBRARY_ENTRY_OPEN = kit.defineScreenCommand({
  id: "library-entry-open",
  readsSubjects: workdesksReadsOf,
  title: "Open",
  run: (ctx, a, named: Named | undefined) => {
    const target = opening(ctx, named)
    if (!target) return
    if (target.to === "folder") return goTo(ctx, a, { id: target.folder, holder: target.folder, holds: true })
    openFromLibrary(ctx, a, target)
  },
  when: ctx => {
    if (given(ctx, undefined) === undefined) return true
    const target = opening(ctx)
    return target !== undefined && target.to !== "folder"
  },
})

export const LIBRARY_BOOK_NEW = kit.defineScreenCommand({
  id: "library-book-new",
  readsSubjects: workdesksReadsOf,
  title: "New book…",
  performs: [BOOK_CREATE.id], // 開いたダイアログが行う
  run: (ctx, a, named: Named | undefined) => {
    const into = holder(ctx, named)
    if (into !== undefined) a.openDialog(LIBRARY_NEW_BOOK_DIALOG.id, { into })
  },
  // 作る先に作ってよいかを、名前を決める前に問う（名前は問うためだけの物）
  performsWith: (ctx, named) => {
    const into = holder(ctx, named)
    return into === undefined ? [] : [{ action: BOOK_CREATE.id, args: { title: ASKED_TITLE, into } }]
  },
  when: inMenu(holder),
})

export const LIBRARY_FOLDER_NEW = kit.defineScreenCommand({
  id: "library-folder-new",
  readsSubjects: workdesksReadsOf,
  title: "New folder…",
  performs: [FOLDER_CREATE.id], // 開いたダイアログが行う
  run: (ctx, a, named: Named | undefined) => {
    const into = holder(ctx, named)
    if (into !== undefined) a.openDialog(LIBRARY_NEW_FOLDER_DIALOG.id, { into })
  },
  performsWith: (ctx, named) => {
    const into = holder(ctx, named)
    return into === undefined ? [] : [{ action: FOLDER_CREATE.id, args: { title: ASKED_TITLE, into } }]
  },
  when: inMenu(holder),
})

// 新しいページを作る先のフォルダ: エントリを受け取ったら、それが書庫ホーム・フォルダ・ブック・ブックの外のバインダのとき、その中。
// フォルダを受け取ったら（何も無い所のメニュー）、ボタンと同じ（holderForNewPage）
const pageHolder = (ctx: ScreenCommandContext, named?: Named): string | undefined => {
  const to = given(ctx, named)
  if (to && "folder" in to) return holderForNewPage(ctx.folders, createdIn(ctx.folders, to.folder))
  const entry = entryOf(ctx, named)
  if (entry !== undefined && isDeskRow(entry)) return holderForNewPage(ctx.folders, createdIn(ctx.folders, entry))
  return entry !== undefined && holderForNewPage(ctx.folders, entry) === entry ? entry : undefined
}

// ページのタイプの一覧のメニューを、右クリックのメニューを開いた位置 pressed に開く（位置を受け取らなければ開かない。選んだタイプのページを作るダイアログは、メニューの行が開く）
export const LIBRARY_PAGE_NEW = kit.defineScreenCommand({
  id: "library-page-new",
  readsSubjects: workdesksReadsOf,
  title: "New page…",
  performs: [PAGE_CREATE.id], // メニューの行が開くダイアログが行う
  run: (ctx, a, named: Named | undefined) => {
    const folder = pageHolder(ctx, named)
    if (folder !== undefined && named?.pressed) a.openContextMenu(LIBRARY_ADD_PAGE_MENU, { folder }, named.pressed)
  },
  // 作るページのタイプは、まだ決まっていない
  performsWith: (ctx, named) => {
    const folder = pageHolder(ctx, named)
    return folder === undefined ? [] : [{ action: PAGE_CREATE.id, args: { folder, type: ANY_PAGE_TYPE } }]
  },
  when: inMenu(pageHolder),
})

export const LIBRARY_ENTRY_RENAME = kit.defineScreenCommand({
  id: "library-entry-rename",
  readsSubjects: workdesksReadsOf,
  title: "Rename…",
  performs: [ENTRY_RENAME.id], // 開いたダイアログが行う
  run: (ctx, a, named: Named | undefined) => {
    const entry = handled(ctx, renames, named)
    if (entry !== undefined) a.openDialog(LIBRARY_RENAME_DIALOG.id, { entry })
  },
  // 今の名前のままにするとして問う（名前の無い物は分からない）
  performsWith: (ctx, named) => {
    const entry = handled(ctx, renames, named)
    if (entry === undefined) return []
    const kind = placeOf(ctx.folders, entry)?.ref.kind
    const title =
      kind === undefined
        ? undefined
        : kind === "page"
          ? ctx.pageTitle(entry)
          : rowTitle(ctx.folders[entry], kind, namingOf(ctx.catalog, ctx.settings))
    return title === undefined ? "unknown" : [{ action: ENTRY_RENAME.id, args: { entry, title } }]
  },
  when: inMenuHandled(renames),
})

// 写す物: ブックかバインダの中か、書庫ホームかフォルダの直下に在るページとバインダ（ブックとフォルダは写さない。読めない物のフォルダの中の物も写さない）
const duplicates: Handles = (folders, entry) => {
  const kind = placedOutsideBooks(folders, entry)?.ref.kind
  return placedInBook(folders, entry) || kind === "page" || kind === "binder"
}

// 写す: ページ・バインダを、すぐ後ろに番号付きの名前で写す。断られたらトーストで知らせる
export const LIBRARY_ENTRY_DUPLICATE = kit.defineScreenCommand({
  id: "library-entry-duplicate",
  readsSubjects: workdesksReadsOf,
  title: "Duplicate",
  performs: [ENTRY_DUPLICATE.id],
  run: (ctx, a, named: Named | undefined) => {
    const entry = handled(ctx, duplicates, named)
    if (entry === undefined) return
    const done = a.perform(ENTRY_DUPLICATE.id, { entry })
    if (!done.ok)
      a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("Cannot be duplicated")) })
  },
  performsWith: (ctx, named) => {
    const entry = handled(ctx, duplicates, named)
    return entry === undefined ? [] : [{ action: ENTRY_DUPLICATE.id, args: { entry } }]
  },
  when: inMenuHandled(duplicates),
})

// エントリ entry をゴミ箱に入れる。断られたらトーストで知らせる。行えたら、それを選んでいれば外す
function trash(ctx: ScreenCommandContext, a: CommandActions, entry: string): void {
  const done = a.perform(ENTRY_TRASH.id, { entry })
  if (done.ok) a.updatePluginState(LIBRARY_PICKED, now => (now === entry ? undefined : now))
  else a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("Could not move to trash")) })
}

export const LIBRARY_ENTRY_TRASH = kit.defineScreenCommand({
  id: "library-entry-trash",
  readsSubjects: workdesksReadsOf,
  title: "Move to trash",
  performs: [ENTRY_TRASH.id],
  run: (ctx, a, named: Named | undefined) => {
    const entry = handled(ctx, trashes, named)
    if (entry !== undefined) trash(ctx, a, entry)
  },
  performsWith: (ctx, named) => {
    const entry = handled(ctx, trashes, named)
    return entry === undefined ? [] : [{ action: ENTRY_TRASH.id, args: { entry } }]
  },
  when: inMenuHandled(trashes),
})

// 動かす（ドラッグで落としたとき）: エントリ entry を、落とす先 to（フォルダの index 番目か、ゴミ箱）へ。how は、先に同じ名前の物が在るときに利用者が選んだ手
// （"number" は番号を付ける。replaces は、消えると確かめた物を上書きする）。断られたらトーストで知らせる。選んでいた行が、開いているフォルダから出たら、選ぶのを外す
type Moving = { entry: string; to: Drop; how?: "number" | { replaces: string } }
export const LIBRARY_ENTRY_MOVE = kit.defineScreenCommand({
  id: "library-entry-move",
  readsSubjects: workdesksReadsOf,
  title: "Move",
  performs: [ENTRY_MOVE.id, ENTRY_MOVE_OVER.id, ENTRY_TRASH.id],
  run: (ctx, a, { entry, to, how }: Moving) => {
    if (to.to === "trash") return trash(ctx, a, entry)
    const { into, index } = to
    const done =
      typeof how === "object"
        ? a.perform(ENTRY_MOVE_OVER.id, { entry, into, index, replaces: how.replaces })
        : a.perform(ENTRY_MOVE.id, { entry, into, index, onConflict: how ?? "refuse" })
    if (!done.ok)
      return a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("Could not move")) })
    if (into !== openedIn(ctx)) a.updatePluginState(LIBRARY_PICKED, now => (now === entry ? undefined : now))
  },
  // 引数を受け取らずに問われたら（押す前のボタンなど）、分からない
  performsWith: (_ctx, moving?: Moving) => {
    if (!moving) return "unknown"
    const { entry, to, how } = moving
    if (to.to === "trash") return [{ action: ENTRY_TRASH.id, args: { entry } }]
    const { into, index } = to
    return typeof how === "object"
      ? [{ action: ENTRY_MOVE_OVER.id, args: { entry, into, index, replaces: how.replaces } }]
      : [{ action: ENTRY_MOVE.id, args: { entry, into, index, onConflict: how ?? "refuse" } }]
  },
  when: () => true,
})

// ツリーの行 row へ移る（開くフォルダ・選ぶ行・中を出すフォルダは、ビューが行を押したときと同じに決める）。フォルダの中へ入るなら、検索をやめる（右の枠にその中身を出す）
function goTo(
  ctx: ScreenCommandContext,
  a: CommandActions,
  row: Pick<TreeRow, "id" | "holder" | "holds"> | undefined,
): void {
  if (!row) return
  const now = unfoldedOf(ctx.pluginState(LIBRARY_UNFOLDED))
  const next = arrivedAt(ctx.folders, row, now, desksIn(ctx))
  if (next.folder !== openedIn(ctx)) a.updatePluginState(LIBRARY_FOLDER, () => next.folder)
  a.updatePluginState(LIBRARY_PICKED, () => next.picked)
  if (next.unfolded !== now) a.updatePluginState(LIBRARY_UNFOLDED, () => next.unfolded)
  if (row.holds && ctx.pluginState(LIBRARY_QUERY) !== undefined) a.updatePluginState(LIBRARY_QUERY, () => undefined)
}

// 呼ばれた場所の書庫の画面のツリー: 出ている行 rows と、今いる行の位置 i（出ていなければ -1）と、中を出しているフォルダ unfolded
function treeAt(ctx: ScreenCommandContext) {
  const unfolded = unfoldedOf(ctx.pluginState(LIBRARY_UNFOLDED))
  const desks = desksIn(ctx)
  const rows = treeRowsOf(ctx.folders, unfolded, unreadableShownIn(ctx.catalog, ctx.settings), desks)
  const at = treeCurrentOf(ctx.folders, openedIn(ctx), ctx.pluginState(LIBRARY_PICKED), desks)
  return { rows, unfolded, i: rows.findIndex(r => r.id === at) }
}

// ツリーで、上・下の行へ移る
export const LIBRARY_TREE_MOVE = kit.defineScreenCommand({
  id: "library-tree-move",
  readsSubjects: workdesksReadsOf,
  title: "Move in the tree",
  run: (ctx, a, { to }: { to: "up" | "down" }) => {
    const { rows, i } = treeAt(ctx)
    goTo(ctx, a, rows[to === "down" ? i + 1 : i - 1])
  },
  when: () => true,
})

// ツリーで、中を出している行なら中をしまい、ほかは、それを持つフォルダの行へ移る
export const LIBRARY_TREE_FOLD_OR_PARENT = kit.defineScreenCommand({
  id: "library-tree-fold-or-parent",
  readsSubjects: workdesksReadsOf,
  title: "Fold or go to the parent",
  run: (ctx, a) => {
    const { rows, unfolded, i } = treeAt(ctx)
    const row = rows[i]
    if (!row) return
    if (row.unfolded === true) a.updatePluginState(LIBRARY_UNFOLDED, () => unfolded.filter(id => id !== row.id))
    else if (row.holder !== row.id)
      goTo(
        ctx,
        a,
        rows.find(r => r.id === row.holder),
      )
  },
  when: () => true,
})

// ツリーで、中をしまっている行なら中を出し、中を出している行なら、その下の行へ移る
export const LIBRARY_TREE_UNFOLD_OR_NEXT = kit.defineScreenCommand({
  id: "library-tree-unfold-or-next",
  readsSubjects: workdesksReadsOf,
  title: "Unfold or go inside",
  run: (ctx, a) => {
    const { rows, unfolded, i } = treeAt(ctx)
    const row = rows[i]
    if (!row) return
    if (row.unfolded === false) a.updatePluginState(LIBRARY_UNFOLDED, () => [...unfolded, row.id])
    else if (row.unfolded === true && rows[i + 1]?.holder === row.id) goTo(ctx, a, rows[i + 1])
  },
  when: () => true,
})

// 右の枠で、選んでいる行の前・次の行か、上・下の段の行を選ぶ（選んでいなければ、最初の行）。行の順はビューと同じ paneIdsOf、段の列の数は、ビューが測った LIBRARY_COLUMNS
export const LIBRARY_PICK_MOVE = kit.defineScreenCommand({
  id: "library-pick-move",
  readsSubjects: workdesksReadsOf,
  title: "Pick the neighbour",
  run: (ctx, a, { to }: { to: PickTo }) => {
    const ids = paneIdsOf(ctx.folders, unreadableItemsIn(ctx), openedIn(ctx), desksIn(ctx))
    const i = ids.indexOf(ctx.pluginState(LIBRARY_PICKED) ?? "")
    const next = i < 0 ? ids[0] : ids[pickedAfter(to, i, ids.length, ctx.pluginState(LIBRARY_COLUMNS) ?? 1)]
    if (next !== undefined) a.updatePluginState(LIBRARY_PICKED, () => next)
  },
  when: () => true,
})

type PickTo = "previous" | "next" | "up" | "down"

// 行 count 個を columns 列で並べたとき、i 番目の行から to へ動いた先の番号（範囲の外なら、無い番号のまま返す）。
// 下の段が短くて真下に行が無いときは、下の段の最後の行
function pickedAfter(to: PickTo, i: number, count: number, columns: number): number {
  if (to === "previous") return i - 1
  if (to === "next") return i + 1
  if (to === "up") return i - columns
  const below = i + columns
  const lastRow = Math.floor((count - 1) / columns)
  return below < count || Math.floor(i / columns) === lastRow ? below : count - 1
}

// 書庫の画面の中に焦点がある間のキーの範囲（LibraryView の根の要素が名乗る）
export const LIBRARY_SCOPE = kit.name("library")
export const LIBRARY_KEY_SCOPE = kit.defineKeyScope({ id: "library", title: "Library", commandsFrom: "screen" })

// ツリーの中・右の枠の中身の中に焦点がある間のキーの範囲（矢印キー。LibraryView のその要素が名乗る）
export const LIBRARY_TREE_SCOPE = kit.name("library-tree")
export const LIBRARY_TREE_KEY_SCOPE = kit.defineKeyScope({
  id: "library-tree",
  title: "Library tree",
  commandsFrom: "screen",
})
export const LIBRARY_CONTENTS_SCOPE = kit.name("library-contents")
export const LIBRARY_CONTENTS_KEY_SCOPE = kit.defineKeyScope({
  id: "library-contents",
  title: "Library contents",
  commandsFrom: "screen",
})

// ツリー・右の枠の中身の、行の外（余白）に焦点がある間のキーの範囲（矢印キーだけ。LibraryView のその要素が名乗る）。
// 矢印で移った行へ LibraryView が焦点を移すので、そのあとは行の範囲のキー（Enter・F2・Delete）も効く
export const LIBRARY_TREE_AROUND_SCOPE = kit.name("library-tree-around")
export const LIBRARY_TREE_AROUND_KEY_SCOPE = kit.defineKeyScope({
  id: "library-tree-around",
  title: "Library tree (outside the rows)",
  commandsFrom: "screen",
})
export const LIBRARY_CONTENTS_AROUND_SCOPE = kit.name("library-contents-around")
export const LIBRARY_CONTENTS_AROUND_KEY_SCOPE = kit.defineKeyScope({
  id: "library-contents-around",
  title: "Library contents (outside the rows)",
  commandsFrom: "screen",
})

// 検索の結果の中に焦点がある間のキーの範囲（Enter。FoundView の行が名乗る）
export const LIBRARY_FOUND_SCOPE = kit.name("library-found")
export const LIBRARY_FOUND_KEY_SCOPE = kit.defineKeyScope({
  id: "library-found",
  title: "Library search results",
  commandsFrom: "screen",
})

export const LIBRARY_KEYS = [
  kit.defineKey({
    id: "library-tree-rename-f2",
    title: "Rename",
    key: "F2",
    command: LIBRARY_ENTRY_RENAME.id,
    args: { at: "tree" },
    scope: LIBRARY_TREE_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-trash-delete",
    title: "Move to trash",
    key: "Delete",
    command: LIBRARY_ENTRY_TRASH.id,
    args: { at: "tree" },
    scope: LIBRARY_TREE_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-up",
    title: "Row above",
    key: "ArrowUp",
    command: LIBRARY_TREE_MOVE.id,
    args: { to: "up" },
    scope: LIBRARY_TREE_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-down",
    title: "Row below",
    key: "ArrowDown",
    command: LIBRARY_TREE_MOVE.id,
    args: { to: "down" },
    scope: LIBRARY_TREE_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-left",
    key: "ArrowLeft",
    command: LIBRARY_TREE_FOLD_OR_PARENT.id,
    scope: LIBRARY_TREE_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-right",
    key: "ArrowRight",
    command: LIBRARY_TREE_UNFOLD_OR_NEXT.id,
    scope: LIBRARY_TREE_SCOPE,
  }),
  kit.defineKey({
    id: "library-pick-previous",
    title: "Previous",
    key: "ArrowLeft",
    command: LIBRARY_PICK_MOVE.id,
    args: { to: "previous" },
    scope: LIBRARY_CONTENTS_SCOPE,
  }),
  kit.defineKey({
    id: "library-pick-next",
    title: "Next",
    key: "ArrowRight",
    command: LIBRARY_PICK_MOVE.id,
    args: { to: "next" },
    scope: LIBRARY_CONTENTS_SCOPE,
  }),
  kit.defineKey({
    id: "library-pick-up",
    title: "Row above",
    key: "ArrowUp",
    command: LIBRARY_PICK_MOVE.id,
    args: { to: "up" },
    scope: LIBRARY_CONTENTS_SCOPE,
  }),
  kit.defineKey({
    id: "library-pick-down",
    title: "Row below",
    key: "ArrowDown",
    command: LIBRARY_PICK_MOVE.id,
    args: { to: "down" },
    scope: LIBRARY_CONTENTS_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-around-up",
    title: "Row above",
    key: "ArrowUp",
    command: LIBRARY_TREE_MOVE.id,
    args: { to: "up" },
    scope: LIBRARY_TREE_AROUND_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-around-down",
    title: "Row below",
    key: "ArrowDown",
    command: LIBRARY_TREE_MOVE.id,
    args: { to: "down" },
    scope: LIBRARY_TREE_AROUND_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-around-left",
    key: "ArrowLeft",
    command: LIBRARY_TREE_FOLD_OR_PARENT.id,
    scope: LIBRARY_TREE_AROUND_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-around-right",
    key: "ArrowRight",
    command: LIBRARY_TREE_UNFOLD_OR_NEXT.id,
    scope: LIBRARY_TREE_AROUND_SCOPE,
  }),
  kit.defineKey({
    id: "library-pick-around-previous",
    title: "Previous",
    key: "ArrowLeft",
    command: LIBRARY_PICK_MOVE.id,
    args: { to: "previous" },
    scope: LIBRARY_CONTENTS_AROUND_SCOPE,
  }),
  kit.defineKey({
    id: "library-pick-around-next",
    title: "Next",
    key: "ArrowRight",
    command: LIBRARY_PICK_MOVE.id,
    args: { to: "next" },
    scope: LIBRARY_CONTENTS_AROUND_SCOPE,
  }),
  kit.defineKey({
    id: "library-pick-around-up",
    title: "Row above",
    key: "ArrowUp",
    command: LIBRARY_PICK_MOVE.id,
    args: { to: "up" },
    scope: LIBRARY_CONTENTS_AROUND_SCOPE,
  }),
  kit.defineKey({
    id: "library-pick-around-down",
    title: "Row below",
    key: "ArrowDown",
    command: LIBRARY_PICK_MOVE.id,
    args: { to: "down" },
    scope: LIBRARY_CONTENTS_AROUND_SCOPE,
  }),
  // 行のボタンが自分で範囲を名乗るので、焦点のある行の上の Enter が効く（右の枠は選んでいる行、ツリーと検索の結果はツリーで今いる行）
  kit.defineKey({
    id: "library-entry-open-enter",
    title: "Open",
    key: "Enter",
    command: LIBRARY_ENTRY_OPEN.id,
    args: undefined,
    scope: LIBRARY_CONTENTS_SCOPE,
  }),
  kit.defineKey({
    id: "library-tree-open-enter",
    title: "Open",
    key: "Enter",
    command: LIBRARY_ENTRY_OPEN.id,
    args: { at: "tree" },
    scope: LIBRARY_TREE_SCOPE,
  }),
  kit.defineKey({
    id: "library-found-open-enter",
    title: "Open",
    key: "Enter",
    command: LIBRARY_ENTRY_OPEN.id,
    args: { at: "tree" },
    scope: LIBRARY_FOUND_SCOPE,
  }),
  kit.defineKey({ id: "library-undo-mod-z", key: "Mod+Z", command: LIBRARY_UNDO.id, scope: LIBRARY_SCOPE }),
  kit.defineKey({ id: "library-redo-mod-shift-z", key: "Mod+Shift+Z", command: LIBRARY_REDO.id, scope: LIBRARY_SCOPE }),
  kit.defineKey({ id: "library-redo-mod-y", key: "Mod+Y", command: LIBRARY_REDO.id, scope: LIBRARY_SCOPE }),
  kit.defineKey({
    id: "library-entry-rename-f2",
    title: "Rename",
    key: "F2",
    command: LIBRARY_ENTRY_RENAME.id,
    args: undefined,
    scope: LIBRARY_CONTENTS_SCOPE,
  }),
  kit.defineKey({
    id: "library-entry-trash-delete",
    title: "Move to trash",
    key: "Delete",
    command: LIBRARY_ENTRY_TRASH.id,
    args: undefined,
    scope: LIBRARY_CONTENTS_SCOPE,
  }),
]
