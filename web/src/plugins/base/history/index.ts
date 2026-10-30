// 画面の履歴（Undo・Redo）: 戻す・やり直すコマンドと、画面の履歴の段が変えた所を置き直すアクション（book-revert）。履歴は store が、利用者が画面で
// 行ったアクションから作る（AI の変更は入らない。ロックの掛け外しのように history: false のアクションも入らない）。
// 戻すのは、カレントのステージで開いているブックの最後の画面の履歴の段。その画面の履歴の段がいくつかのブックを変えていれば、その全部を戻す
import { z } from "zod"
import type { HistoryStep } from "../../../core/history"
import type { CommandContext } from "../../../store/commands/def"
import type { Actions } from "../../../store/store"
import { kit } from "../kit"
import { refusalMessage } from "../utils/refusal"
import { applyRestore, type RestoreArgs, restoreArgs } from "./restore"

const Fields = z.record(z.string(), z.unknown())
const FieldsPatch = z.strictObject({ set: Fields, unset: z.array(z.string()) })
const Id = z.string().min(1)
const Index = z.number().int()

export const HISTORY_RESTORE = kit.defineAction({
  id: "book-revert",
  attach: { books: true },
  userOnly: true,
  history: false,
  aiDescription: "The screen's undo and redo: put back what one step of the user's history changed.",
  title: "Undo or redo",
  target: "book",
  // 変えるページが 1 つならそのページとアイテム。いくつもなら所は言えず、ページのロックは行った後の keeps が止める
  permissionScope: (args: RestoreArgs) =>
    args.pages.length === 1 && args.pages[0]
      ? {
          page: args.pages[0].id,
          ...("items" in args.pages[0] ? { items: args.pages[0].items.map(i => i.id) } : {}),
        }
      : {},
  args: z.strictObject({
    fields: FieldsPatch,
    pages: z.array(
      z.union([
        z.strictObject({ id: Id, index: Index, page: Fields.nullable() }),
        z.strictObject({
          id: Id,
          fields: FieldsPatch,
          items: z.array(z.strictObject({ id: Id, index: Index, item: Fields.nullable() })),
        }),
      ]),
    ),
  }),
  run: (book, args) => ({ next: applyRestore(book, args), result: {} }),
})

// 置き直したあと、開いていたいページ: 画面の履歴の段がそのブックで変えたページのうち、置き直したあとも残る最初のページ
const pageOf = (args: RestoreArgs): string | undefined => args.pages.find(p => !("page" in p) || p.page !== null)?.id

// 画面の履歴の段 step を、from が undo なら前へ戻し、redo なら後へやり直す。断られたら（ロック中など）トーストで知らせ、画面の履歴の段は動かさない
function restore(ctx: CommandContext, a: Actions, from: "undo" | "redo"): void {
  const step: HistoryStep | undefined = ctx.bookHistory[from].at(-1)
  const opened = ctx.stage.opened
  if (!step || !opened) return
  for (const [book, { before, after }] of Object.entries(step.books)) {
    const args = from === "undo" ? restoreArgs(after, before) : restoreArgs(before, after)
    const done = a.perform(HISTORY_RESTORE.id, args, { book })
    if (!done.ok) {
      const fallback = from === "undo" ? kit.message("Could not undo") : kit.message("Could not redo")
      a.showToast({ kind: "warn", message: refusalMessage(ctx.catalog, done, fallback) })
      return
    }
    const page = book === opened.book ? pageOf(args) : undefined
    if (page && page !== opened.page) a.openPage(ctx.stage.id, page)
  }
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
