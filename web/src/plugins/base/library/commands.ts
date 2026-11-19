// 書庫の画面のコマンド: 選んでいる物（右クリックのメニューからは、右クリックした物）を開く・名前を変える・ゴミ箱に入れる、中にブック・フォルダを作る、書庫の画面の履歴を元に戻す・やり直す（library-revert で、最後の画面の履歴の段が変えた所を置き直す）。
// キーは、書庫の画面（LibraryView）の中に焦点がある間だけ効く（キーの範囲 library）。置き直しても何も変わらない段は、動かして飛ばし、その次の段を置き直す。
// 断られたらトーストで知らせ（その間のほかの変更とぶつかって断られたなら、2 行目にそう出す）、その画面の履歴の段は動かさない

import { placeOf } from "../../../core/entries"
import { HOME_ID } from "../../../core/folders"
import { LIBRARY_HISTORY } from "../../../core/history"
import { type CommandActions, type ScreenCommandContext, storeActionsOf } from "../../../store/commands/def"
import { NO_STAGE } from "../../../store/dialogs"
import { showNotRestored } from "../history"
import { isRevertUnchanged } from "../history/restore"
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import { LIBRARY_NEW_BOOK_DIALOG, LIBRARY_NEW_FOLDER_DIALOG, LIBRARY_RENAME_DIALOG } from "./dialog"
import { holdsEntries, placedInFolder } from "./entries"
import { ENTRY_TRASH } from "./entry-trash"
import { NOT_OPENED, type OpenTarget, openTargetOf } from "./outline"
import { LIBRARY_REVERT, libraryRevertArgs } from "./revert"
import { LIBRARY_FOLDER, LIBRARY_PICKED } from "./state"

function restore(ctx: ScreenCommandContext, a: CommandActions, from: "undo" | "redo"): void {
  for (const step of [...ctx.libraryHistory[from]].reverse()) {
    const result = a.perform(LIBRARY_REVERT.id, libraryRevertArgs(step, from === "undo" ? "before" : "after"))
    if (!result.ok && !isRevertUnchanged(result)) {
      showNotRestored(ctx, a, from, result, { clash: kit.message("Clashes with other changes") })
      return
    }
    a.moveHistory(LIBRARY_HISTORY, from)
    if (result.ok) return
  }
}

export const LIBRARY_UNDO = kit.defineScreenCommand({
  id: "library-undo",
  title: "Undo in the library",
  performs: [LIBRARY_REVERT.id],
  run: (ctx, a) => restore(ctx, a, "undo"),
  when: () => true,
  enabled: ctx => ctx.libraryHistory.undo.length > 0,
})

export const LIBRARY_REDO = kit.defineScreenCommand({
  id: "library-redo",
  title: "Redo in the library",
  performs: [LIBRARY_REVERT.id],
  run: (ctx, a) => restore(ctx, a, "redo"),
  when: () => true,
  enabled: ctx => ctx.libraryHistory.redo.length > 0,
})

// 書庫の画面の右クリックのメニュー: 行（ツリーの行・右の枠のアイコン）のメニューと、右の枠の何も無い所のメニュー（受け取るのは、開いているフォルダ）
export const LIBRARY_ENTRY_CONTEXT = kit.name("library-entry-context")
export const LIBRARY_FOLDER_CONTEXT = kit.name("library-folder-context")
// LibraryView が開く右クリックのメニュー（LibraryView を描くウィジェットが、contextMenus に書く）
export const LIBRARY_CONTEXT_MENUS = [LIBRARY_ENTRY_CONTEXT, LIBRARY_FOLDER_CONTEXT] as const

type Named = { entry: string } | undefined

// コマンドが扱うエントリ: 名指した物 named。無ければ、開いている書庫の右クリックのメニューが受け取った物。それも無ければ、呼ばれた場所の書庫の画面で選んでいる行。
// それも無ければ、右の枠に中身を出しているフォルダ（ツリーで選んだフォルダ）
function entryOf(ctx: ScreenCommandContext, named?: Named): string | undefined {
  if (named) return named.entry
  const menu = ctx.contextMenu
  if (menu && (LIBRARY_CONTEXT_MENUS as readonly string[]).includes(menu.id))
    return (menu.target as { entry: string }).entry
  return ctx.pluginState(LIBRARY_PICKED) ?? ctx.pluginState(LIBRARY_FOLDER)
}

// 名前を変えられる・ゴミ箱に入れられる・動かせるエントリか（エントリのアクションが扱う物: 書庫ホームかフォルダの直下に在る物）
const placed = (ctx: ScreenCommandContext, named?: Named): string | undefined => {
  const entry = entryOf(ctx, named)
  return entry !== undefined && placedInFolder(ctx.folders, entry) ? entry : undefined
}

// 中に新しいブック・フォルダを作れるフォルダか（書庫ホームかフォルダで、ゴミ箱の中でない）
const holder = (ctx: ScreenCommandContext, named?: Named): string | undefined => {
  const entry = entryOf(ctx, named) ?? HOME_ID
  return holdsEntries(ctx.folders, entry) ? entry : undefined
}

// 開く行き先（フォルダは開かない: 中へ入るのは、行を押す動き）
function opening(
  ctx: ScreenCommandContext,
  named?: Named,
): Exclude<OpenTarget, typeof NOT_OPENED | { to: "folder" }> | undefined {
  const entry = entryOf(ctx, named)
  const kind = entry === undefined ? undefined : placeOf(ctx.folders, entry)?.ref.kind
  if (entry === undefined || kind === undefined) return undefined
  // ページが読めるかは、フォルダの表からは分からない（読めないページは、ブックを開いた先が見せる）
  const readable = kind === "page" || ctx.folders[entry] !== undefined
  const target = openTargetOf(ctx.folders, { id: entry, kind, readable })
  return target === NOT_OPENED || target.to === "folder" ? undefined : target
}

export const LIBRARY_ENTRY_OPEN = kit.defineScreenCommand({
  id: "library-entry-open",
  title: "Open",
  run: (ctx, a, named: Named) => {
    const target = opening(ctx, named)
    if (!target) return
    const store = storeActionsOf(a)
    const stage = store.showBookStage(target.book, target.page)
    if (stage !== NO_STAGE && target.binder !== undefined) store.openBinder(stage, target.binder)
  },
  when: ctx => opening(ctx) !== undefined,
})

export const LIBRARY_BOOK_NEW = kit.defineScreenCommand({
  id: "library-book-new",
  title: "New book…",
  run: (ctx, a, named: Named) => {
    const into = holder(ctx, named)
    if (into !== undefined) a.openDialog(LIBRARY_NEW_BOOK_DIALOG.id, { into })
  },
  when: ctx => holder(ctx) !== undefined,
})

export const LIBRARY_FOLDER_NEW = kit.defineScreenCommand({
  id: "library-folder-new",
  title: "New folder…",
  run: (ctx, a, named: Named) => {
    const into = holder(ctx, named)
    if (into !== undefined) a.openDialog(LIBRARY_NEW_FOLDER_DIALOG.id, { into })
  },
  when: ctx => holder(ctx) !== undefined,
})

export const LIBRARY_ENTRY_RENAME = kit.defineScreenCommand({
  id: "library-entry-rename",
  title: "Rename…",
  run: (ctx, a, named: Named) => {
    const entry = placed(ctx, named)
    if (entry !== undefined) a.openDialog(LIBRARY_RENAME_DIALOG.id, { entry })
  },
  when: ctx => placed(ctx) !== undefined,
})

// ゴミ箱に入れる。断られたらトーストで知らせる。行えたら、選んでいる行を外す
export const LIBRARY_ENTRY_TRASH = kit.defineScreenCommand({
  id: "library-entry-trash",
  title: "Move to trash",
  performs: [ENTRY_TRASH.id],
  run: (ctx, a, named: Named) => {
    const entry = placed(ctx, named)
    if (entry === undefined) return
    const done = a.perform(ENTRY_TRASH.id, { entry })
    if (done.ok) a.updatePluginState(LIBRARY_PICKED, now => (now === entry ? undefined : now))
    else
      a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("Could not move to trash")) })
  },
  when: ctx => placed(ctx) !== undefined,
})

// 書庫の画面の中に焦点がある間のキーの範囲（LibraryView の根の要素が名乗る）
export const LIBRARY_SCOPE = kit.name("library")
export const LIBRARY_KEY_SCOPE = kit.defineKeyScope({ id: "library", title: "Library", commandsFrom: "screen" })

export const LIBRARY_KEYS = [
  kit.defineKey({ id: "library-undo-mod-z", key: "Mod+Z", command: LIBRARY_UNDO.id, scope: LIBRARY_SCOPE }),
  kit.defineKey({ id: "library-redo-mod-shift-z", key: "Mod+Shift+Z", command: LIBRARY_REDO.id, scope: LIBRARY_SCOPE }),
  kit.defineKey({ id: "library-redo-mod-y", key: "Mod+Y", command: LIBRARY_REDO.id, scope: LIBRARY_SCOPE }),
  kit.defineKey({
    id: "library-entry-rename-f2",
    title: "Rename",
    key: "F2",
    command: LIBRARY_ENTRY_RENAME.id,
    args: undefined,
    scope: LIBRARY_SCOPE,
  }),
  kit.defineKey({
    id: "library-entry-trash-delete",
    title: "Move to trash",
    key: "Delete",
    command: LIBRARY_ENTRY_TRASH.id,
    args: undefined,
    scope: LIBRARY_SCOPE,
  }),
]
