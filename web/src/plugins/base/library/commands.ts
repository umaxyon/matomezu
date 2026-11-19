// 書庫の画面のコマンド: 選んでいる物の名前を変える・ゴミ箱に入れる、書庫の画面の履歴を元に戻す・やり直す（library-revert で、最後の画面の履歴の段が変えた所を置き直す）。
// キーは、書庫の画面（LibraryView）の中に焦点がある間だけ効く（キーの範囲 library）。置き直しても何も変わらない段は、動かして飛ばし、その次の段を置き直す。
// 断られたらトーストで知らせ（その間のほかの変更とぶつかって断られたなら、2 行目にそう出す）、その画面の履歴の段は動かさない
import { LIBRARY_HISTORY } from "../../../core/history"
import type { CommandActions, ScreenCommandContext } from "../../../store/commands/def"
import { showNotRestored } from "../history"
import { isRevertUnchanged } from "../history/restore"
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import { LIBRARY_RENAME_DIALOG } from "./dialog"
import { ENTRY_TRASH } from "./entry-trash"
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

// コマンドが扱うエントリ: 名指した物 named。無ければ、呼ばれた場所の書庫の画面で選んでいる行。それも無ければ、右の枠に中身を出しているフォルダ（ツリーで選んだフォルダ）
const entryOf = (ctx: ScreenCommandContext, named: { entry: string } | undefined): string | undefined =>
  named?.entry ?? ctx.pluginState(LIBRARY_PICKED) ?? ctx.pluginState(LIBRARY_FOLDER)

export const LIBRARY_ENTRY_RENAME = kit.defineScreenCommand({
  id: "library-entry-rename",
  title: "Rename",
  run: (ctx, a, named: { entry: string } | undefined) => {
    const entry = entryOf(ctx, named)
    if (entry !== undefined) a.openDialog(LIBRARY_RENAME_DIALOG.id, { entry })
  },
  when: () => true,
})

// ゴミ箱に入れる。断られたらトーストで知らせる。行えたら、選んでいる行を外す
export const LIBRARY_ENTRY_TRASH = kit.defineScreenCommand({
  id: "library-entry-trash",
  title: "Move to trash",
  performs: [ENTRY_TRASH.id],
  run: (ctx, a, named: { entry: string } | undefined) => {
    const entry = entryOf(ctx, named)
    if (entry === undefined) return
    const done = a.perform(ENTRY_TRASH.id, { entry })
    if (done.ok) a.updatePluginState(LIBRARY_PICKED, () => undefined)
    else
      a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, kit.message("Could not move to trash")) })
  },
  when: () => true,
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
