// 書庫の画面のコマンド: 書庫の画面の履歴を元に戻す・やり直す（library-revert で、最後の画面の履歴の段が変えた所を置き直す）。
// キーは、書庫の画面（LibraryView）の中に焦点がある間だけ効く（キーの範囲 library）。断られたらトーストで知らせ、画面の履歴の段は動かさない
import { LIBRARY_HISTORY } from "../../../core/history"
import type { CommandActions, ScreenCommandContext } from "../../../store/commands/def"
import { showNotRestored } from "../history"
import { kit } from "../kit"
import { LIBRARY_REVERT, libraryRevertArgs } from "./revert"

function restore(ctx: ScreenCommandContext, a: CommandActions, from: "undo" | "redo"): void {
  const step = ctx.libraryHistory[from].at(-1)
  if (!step) return
  const result = a.perform(LIBRARY_REVERT.id, libraryRevertArgs(step, from === "undo" ? "before" : "after"))
  if (result.ok) a.moveHistory(LIBRARY_HISTORY, from)
  else showNotRestored(ctx, a, from, result)
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

// 書庫の画面の中に焦点がある間のキーの範囲（LibraryView の根の要素が名乗る）
export const LIBRARY_SCOPE = kit.name("library")
export const LIBRARY_KEY_SCOPE = kit.defineKeyScope({ id: "library", title: "Library", commandsFrom: "screen" })

export const LIBRARY_KEYS = [
  kit.defineKey({ id: "library-undo-mod-z", key: "Mod+Z", command: LIBRARY_UNDO.id, scope: LIBRARY_SCOPE }),
  kit.defineKey({ id: "library-redo-mod-shift-z", key: "Mod+Shift+Z", command: LIBRARY_REDO.id, scope: LIBRARY_SCOPE }),
  kit.defineKey({ id: "library-redo-mod-y", key: "Mod+Y", command: LIBRARY_REDO.id, scope: LIBRARY_SCOPE }),
]
