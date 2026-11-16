// 画面の履歴（Undo・Redo）: 戻す・やり直すコマンドと、画面の履歴の段が変えた所を置き直すアクション（book-revert）。履歴は store が、利用者が画面で
// 行ったアクションと、その窓で見えた AI とほかの窓の変更から作る（ロックの掛け外しのように history: false のアクションは入らない）。
// 戻すのは、カレントのステージで開いているブックの最後の画面の履歴の段。その画面の履歴の段がいくつかのブックを変えていれば、その全部を戻す

import { pagesOf } from "../../../core/book"
import type { LibraryTargets } from "../../../core/def/action"
import type { HistoryStep } from "../../../core/history"
import type { Library } from "../../../core/library"
import { patchesToward, restoredLibrary } from "../../../core/restore"
import { shownPageId } from "../../../core/stage"
import { booksOf, type CommandActions, type CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"
import { RevertArgs, restoredPages } from "./restore"

export const HISTORY_RESTORE = kit.defineAction({
  id: "book-revert",
  userOnly: true,
  history: false,
  aiDescription: "The screen's undo and redo: put back what one step of the user's history changed.",
  title: "Undo or redo",
  target: "library",
  // 変えるブックが 1 冊で、置き直すページが 1 つなら、そのページとアイテムを名指す。ほかは所を言えず、ロックは行った後の keeps が止める
  permissionScope: (args: RevertArgs): LibraryTargets => {
    const pages = restoredPages(args.pages)
    const [page] = pages
    const one = args.books.length === 1 && pages.length === 1 ? page : undefined
    const where = one ? { page: one.id, ...(one.items ? { items: [...one.items] } : {}) } : {}
    return { books: args.books.map(book => ({ book, where })), creates: false }
  },
  args: RevertArgs,
  run: (library, args) => {
    const next = restoredLibrary(library, args.books, args)
    return next ? { next, result: {} } : null
  },
})

// 置き直したあと、開いていたいページ: 画面の履歴の段が変えたページのうち、一覧 books を args で置き直したあとの、ブック book に入っている最初のページ
function pageToOpen(
  books: Library,
  step: HistoryStep,
  to: "before" | "after",
  book: string,
  args: RevertArgs,
): string | undefined {
  const after = restoredLibrary(books, args.books, args)?.[book]
  const inBook = new Set(after ? pagesOf(after).map(p => p.id) : [])
  return Object.entries(step.pages).find(([id, row]) => row[to] !== "none" && inBook.has(id))?.[0]
}

// 画面の履歴の段 step を、from が undo なら前へ戻し、redo なら後へやり直す（変えたブックがいくつ在っても、1 回のアクションで置き直す）。
// 断られたら（ロック中など）トーストで知らせ（認可ステップが止めたなら、2 行目にそのブックの名前と認可ステップの名前）、画面の履歴の段は動かさない
function restore(ctx: CommandContext, a: CommandActions, from: "undo" | "redo"): void {
  const step: HistoryStep | undefined = ctx.bookHistory[from].at(-1)
  const opened = ctx.stage.opened
  if (!step || !opened) return
  const to = from === "undo" ? "before" : "after"
  const args = {
    books: [...step.inBooks],
    pages: patchesToward(step.pages, to),
    folders: patchesToward(step.folders, to),
  }
  const page = pageToOpen(booksOf(ctx), step, to, opened.book, args)
  if (Object.keys(args.pages).length + Object.keys(args.folders).length > 0) {
    const result = a.perform(HISTORY_RESTORE.id, args)
    if (!result.ok) {
      const denied = result.reason === "denied" ? ctx.catalog.permissions.get(result.permission) : undefined
      const book = result.reason === "denied" && result.book ? booksOf(ctx)[result.book] : undefined
      a.showToast({
        kind: "warn",
        message: from === "undo" ? kit.message("Could not undo") : kit.message("Could not redo"),
        detail: denied &&
          book && {
            message: kit.message('{reason}: "{book}"'),
            params: { book: book.title, reason: { message: denied.title } },
          },
      })
      return
    }
  }
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
  // 印刷プレビューの間は、ブックを変えない（置き直しは一覧が対象のアクションなので、ステージが止めない。ここで止める）
  enabled: ctx => ctx.stage.mode === "edit" && ctx.bookHistory.undo.length > 0,
})

export const REDO = kit.defineCommand({
  id: "redo",
  title: "Redo",
  performs: [HISTORY_RESTORE.id],
  permissionScope: "book",
  run: (ctx, a) => restore(ctx, a, "redo"),
  when: ctx => ctx.book !== null,
  // 印刷プレビューの間は、ブックを変えない（置き直しは一覧が対象のアクションなので、ステージが止めない。ここで止める）
  enabled: ctx => ctx.stage.mode === "edit" && ctx.bookHistory.redo.length > 0,
})

export const HISTORY_KEYS = [
  kit.defineKey({ id: "undo-mod-z", key: "Mod+Z", command: UNDO.id, scope: "stage" }),
  kit.defineKey({ id: "redo-mod-shift-z", key: "Mod+Shift+Z", command: REDO.id, scope: "stage" }),
  kit.defineKey({ id: "redo-mod-y", key: "Mod+Y", command: REDO.id, scope: "stage" }),
]
