// 画面の履歴（Undo・Redo）: 戻す・やり直すコマンドと、画面の履歴の段が変えた所を置き直すアクション（book-revert）。履歴は store が、利用者が画面で
// 行ったアクションと、その窓で見えた AI とほかの窓の変更から作る（ロックの掛け外しのように history: false のアクションは入らない）。
// 戻すのは、カレントのステージで開いているブックの最後の画面の履歴の段。その画面の履歴の段がいくつかのブックを変えていれば、その全部を戻す

import { findPage } from "../../../core/book"
import type { HistoryStep } from "../../../core/history"
import { type Patch, patchOf } from "../../../core/patch"
import type { Book } from "../../../core/schema/book"
import { shownPageId } from "../../../core/stage"
import type { CommandActions, CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"
import { applyRestore, PatchSchema, restoredEntries } from "./restore"

export const HISTORY_RESTORE = kit.defineAction({
  id: "book-revert",
  attach: { books: true },
  userOnly: true,
  history: false,
  aiDescription: "The screen's undo and redo: put back what one step of the user's history changed.",
  title: "Undo or redo",
  target: "book",
  // 置き直す並びの要素が 1 つなら、それをページとして名指す（とアイテム）。バインダなら無いページを名指すことになり、いくつもなら所は言えない。どちらも、ロックは行った後の keeps が止める
  permissionScope: (args: Patch) => {
    const entries = restoredEntries(args)
    const page = entries.length === 1 ? entries[0] : undefined
    return page ? { page: page.id, ...(page.items ? { items: [...page.items] } : {}) } : {}
  },
  args: PatchSchema,
  run: (book, args) => ({ next: applyRestore(book, args), result: {} }),
})

// 置き直したあと、開いていたいページ: 画面の履歴の段がそのブックで変えたページのうち、置き直したあとのブック to に在る最初のページ
const pageOf = (args: Patch, to: Book): string | undefined =>
  restoredEntries(args).find(p => findPage(to, p.id) !== undefined)?.id

// 画面の履歴の段 step を、from が undo なら前へ戻し、redo なら後へやり直す。断られたら（ロック中など）トーストで知らせ（認可ステップが止めたなら、2 行目にそのブックの名前と認可ステップの名前）、画面の履歴の段は動かさない。
// いくつものブックを変えた画面の履歴の段で途中のブックが断られたら、置き直したブックを元に戻す（どのブックも画面の履歴の段のとおりのまま）
function restore(ctx: CommandContext, a: CommandActions, from: "undo" | "redo"): void {
  const step: HistoryStep | undefined = ctx.bookHistory[from].at(-1)
  const opened = ctx.stage.opened
  if (!step || !opened) return
  const done: { book: string; args: Patch; to: Book; back: Patch }[] = []
  for (const [book, { before, after }] of Object.entries(step.books)) {
    const [was, to] = from === "undo" ? [after, before] : [before, after]
    const args = patchOf(was, to)
    if (!args) continue
    const result = a.perform(HISTORY_RESTORE.id, args, { book })
    if (!result.ok) {
      for (const d of done.reverse()) a.perform(HISTORY_RESTORE.id, d.back, { book: d.book })
      const denied = result.reason === "denied" ? ctx.catalog.permissions.get(result.permission) : undefined
      a.showToast({
        kind: "warn",
        message: from === "undo" ? kit.message("Could not undo") : kit.message("Could not redo"),
        detail: denied && {
          message: kit.message('{reason}: "{book}"'),
          params: { book: was.title, reason: { message: denied.title } },
        },
      })
      return
    }
    done.push({ book, args, to, back: patchOf(to, was) as Patch })
  }
  const shown = done.find(d => d.book === opened.book)
  const page = shown && pageOf(shown.args, shown.to)
  if (page && page !== shownPageId(opened)) a.openPage(page)
  a.moveHistory(opened.book, from)
}

export const UNDO = kit.defineCommand({
  id: "undo",
  title: "Undo",
  performs: [HISTORY_RESTORE.id],
  permissionScope: "book",
  run: (ctx, a) => restore(ctx, a, "undo"),
  when: ctx => ctx.book !== null,
  enabled: ctx => ctx.bookHistory.undo.length > 0,
})

export const REDO = kit.defineCommand({
  id: "redo",
  title: "Redo",
  performs: [HISTORY_RESTORE.id],
  permissionScope: "book",
  run: (ctx, a) => restore(ctx, a, "redo"),
  when: ctx => ctx.book !== null,
  enabled: ctx => ctx.bookHistory.redo.length > 0,
})

export const HISTORY_KEYS = [
  kit.defineKey({ id: "undo-mod-z", key: "Mod+Z", command: UNDO.id, scope: "stage" }),
  kit.defineKey({ id: "redo-mod-shift-z", key: "Mod+Shift+Z", command: REDO.id, scope: "stage" }),
  kit.defineKey({ id: "redo-mod-y", key: "Mod+Y", command: REDO.id, scope: "stage" }),
]
