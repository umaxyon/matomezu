// 画面の履歴（Undo・Redo）: 戻す・やり直すコマンドと、画面の履歴の段が変えた所を置き直すアクション（history-revert）。履歴は store が、利用者が画面で
// 行ったアクションと、その窓で見えた AI とほかの窓の変更から作る（ロックの掛け外しのように history: false のアクションは入らない）。
// 戻すのは、カレントのステージで開いているステージエントリ（ブックか、ブックの外のページ。ブックの外のバインダは置き直さない）の最後の画面の履歴の段。その画面の履歴の段がいくつかのステージエントリを変えていれば、その全部を戻す

import { pagesOf } from "../../../core/book"
import type { LibraryTargets } from "../../../core/def/action"
import type { Folders } from "../../../core/folders"
import type { HistoryStep } from "../../../core/history"
import type { MessageKey } from "../../../core/i18n/i18n"
import type { Books } from "../../../core/library"
import { shownPageId } from "../../../core/stage"
import {
  booksOf,
  type CommandActions,
  type CommandContext,
  type ScreenCommandContext,
  tryPerformOf,
} from "../../../store/commands/def"
import { kit } from "../kit"
import {
  DECLINED_UNCHANGED,
  isRevertUnchanged,
  patchesToward,
  RevertArgs,
  restoredBooks,
  restoredLibrary,
  restoredPages,
  UNCHANGED,
} from "./restore"

export const HISTORY_RESTORE = kit.defineAction({
  id: "history-revert",
  userOnly: true,
  history: false,
  aiDescription: "The screen's undo and redo: put back what one step of the user's history changed.",
  title: "Undo or redo",
  target: "library",
  // 変えるステージエントリがブック 1 冊で、置き直すページが 1 つなら、そのページとアイテムを名指す。ほかは所を言えず、ロックは行った後の keeps が止める。
  // ブックの外のページは、そのページの全部を変えるとして問う
  permissionScope: (args: RevertArgs): LibraryTargets => {
    const pages = restoredPages(args.pages)
    const [page] = pages
    const books = args.outermosts.filter(e => e.kind === "book")
    const one = args.outermosts.length === 1 && pages.length === 1 ? page : undefined
    const where = one ? { page: one.id, ...(one.items ? { items: [...one.items] } : {}) } : {}
    return {
      books: books.map(e => ({ book: e.id, where })),
      entries: args.outermosts.filter(e => e.kind === "page").map(e => ({ entry: e.id, where: "all-pages" })),
      creates: false,
    }
  },
  args: RevertArgs,
  run: (library, args) => {
    const next = restoredLibrary(library, args.outermosts, args)
    if (next === UNCHANGED) return DECLINED_UNCHANGED
    return next && { next, result: {} }
  },
})

// 画面の履歴の鍵 id のステージエントリの種類: フォルダの表 folders でブックの行ならブック、ほかはブックの外のページ（置き直しのアクションが、実体で確かめ直す）
const kindOf = (folders: Folders, id: string): RevertArgs["outermosts"][number]["kind"] =>
  folders[id]?.folderRole === "book" ? "book" : "page"

// 置き直したあと、開いていたいページ: 画面の履歴の段が変えたページのうち、ブックの全部 books を args で置き直したあとの、ブック book に入っている最初のページ
function pageToOpen(
  books: Books,
  step: HistoryStep,
  to: "before" | "after",
  book: string,
  args: RevertArgs,
): string | undefined {
  const named = args.outermosts.filter(e => e.kind === "book").map(e => e.id)
  const after = restoredBooks(books, named, args)?.[book]
  const inBook = new Set(after ? pagesOf(after).map(p => p.id) : [])
  return Object.entries(step.pages).find(([id, row]) => row[to] !== "none" && inBook.has(id))?.[0]
}

// 画面の履歴 history（ステージエントリの id か LIBRARY_HISTORY）の戻す・やり直すが断られたら: トーストで知らせ（認可ステップが止めたなら、2 行目にその名前。
// 止めたブックかブックの外のページの名前 name が分かれば添える。土台かアクションが断ったなら、2 行目に clash を出す）、土台かアクションが断った（その間のほかの変更とぶつかった）なら、
// その画面の履歴の段を捨てる（次はその前の段を置き直す）。認可ステップが止めた（ロック中など、待てば通る）なら、段は動かさない
export function notRestored(
  ctx: ScreenCommandContext,
  a: Pick<CommandActions, "showToast" | "dropHistory">,
  history: string,
  from: "undo" | "redo",
  refused: { reason: string; permission?: string },
  { name, clash }: { name?: string; clash?: MessageKey } = {},
): void {
  const denied =
    refused.reason === "denied" && refused.permission ? ctx.catalog.permissions.get(refused.permission) : undefined
  a.showToast({
    kind: "warn",
    message: from === "undo" ? kit.message("Could not undo") : kit.message("Could not redo"),
    detail: denied
      ? name === undefined
        ? { message: denied.title }
        : { message: kit.message('{reason}: "{name}"'), params: { name, reason: { message: denied.title } } }
      : refused.reason === "refused"
        ? clash && { message: clash }
        : undefined,
  })
  if (refused.reason === "refused") a.dropHistory(history, from)
}

// 置き直しの答え（行わずに確かめた物。置き直す値が無い画面の履歴の段は undefined）
type Tried = { ok: boolean; reason?: string; kind?: string } | undefined

// 画面の履歴 history の戻す・やり直すがぶつかって断られ、その画面の履歴の段を捨てたあと、続く画面の履歴の段 steps（次に置き直す順）のうち、
// 続けてぶつかる物もまとめて捨てる。画面の履歴の段ごとに tries で置き直しを行わずに確かめ、ぶつかる（土台かアクションが断る）物は捨てる。
// 置き直しても何も変わらない物は、いつもの戻す・やり直すと同じに動かして飛ばす。置き直せる物・認可ステップが止める物に当たったら、そこで止める
// （その画面の履歴の段は残し、次に押したときに置き直す）。何も置き直さない
export function dropClashing(
  a: Pick<CommandActions, "dropHistory" | "moveHistory">,
  history: string,
  from: "undo" | "redo",
  steps: readonly HistoryStep[],
  tries: (step: HistoryStep) => Tried,
): void {
  for (const step of steps) {
    const tried = tries(step)
    if (!tried || isRevertUnchanged(tried)) a.moveHistory(history, from)
    else if (!tried.ok && tried.reason === "refused") a.dropHistory(history, from)
    else return
  }
}

// 最後の画面の履歴の段を、from が undo なら前へ戻し、redo なら後へやり直す（変えたブックがいくつ在っても、1 回のアクションで置き直す）。
// 置き直しても何も変わらない段（もうその側の値になっている）は、動かして飛ばし、その次の段を置き直す。
// 断られたら notRestored で知らせ（認可ステップが止めたなら、2 行目にそのブックの名前と認可ステップの名前）、ぶつかって断られた画面の履歴の段は捨て、
// 認可ステップが止めた物は動かさない。ぶつかって断られたら、続けてぶつかる画面の履歴の段もまとめて捨てる（dropClashing。トーストは 1 つ）
function restore(ctx: CommandContext, a: CommandActions, from: "undo" | "redo"): void {
  const opened = ctx.stage.opened
  if (!opened) return
  const to = from === "undo" ? "before" : "after"
  const argsOf = (step: HistoryStep) => ({
    outermosts: step.outermosts.map(id => ({ kind: kindOf(ctx.folders, id), id })),
    pages: patchesToward(step.pages, to),
    folders: patchesToward(step.folders, to),
  })
  const changes = (args: RevertArgs) => Object.keys(args.pages).length + Object.keys(args.folders).length > 0
  const steps = [...ctx.history[from]].reverse()
  for (const [i, step] of steps.entries()) {
    const args = argsOf(step)
    const page =
      opened.outermost.kind === "book" ? pageToOpen(booksOf(ctx), step, to, opened.outermost.id, args) : undefined
    const result = changes(args) ? a.perform(HISTORY_RESTORE.id, args) : undefined
    if (result && !result.ok && !isRevertUnchanged(result)) {
      const denied = result.reason === "denied" ? result : undefined
      const book = denied?.book ? booksOf(ctx)[denied.book]?.title : undefined
      notRestored(ctx, a, opened.outermost.id, from, result, {
        name: book ?? (denied?.page ? ctx.pageTitle(denied.page) : undefined),
        clash: kit.message("Clashes with other changes"),
      })
      if (result.reason === "refused")
        dropClashing(a, opened.outermost.id, from, steps.slice(i + 1), s => {
          const next = argsOf(s)
          return changes(next) ? tryPerformOf(a)(HISTORY_RESTORE.id, next) : undefined
        })
      return
    }
    a.moveHistory(opened.outermost.id, from)
    if (!result?.ok) continue
    if (page && page !== shownPageId(opened)) a.openPage(page)
    return
  }
}

// 開いているステージエントリの画面の履歴に、from の側の段が在るか
const hasSteps = (ctx: CommandContext, from: "undo" | "redo"): boolean => ctx.history[from].length > 0

export const UNDO = kit.defineCommand({
  id: "undo",
  title: "Undo",
  performs: [HISTORY_RESTORE.id],
  permissionScope: "book",
  run: (ctx, a) => restore(ctx, a, "undo"),
  when: ctx => ctx.stage.opened !== null,
  enabled: ctx => hasSteps(ctx, "undo"),
})

export const REDO = kit.defineCommand({
  id: "redo",
  title: "Redo",
  performs: [HISTORY_RESTORE.id],
  permissionScope: "book",
  run: (ctx, a) => restore(ctx, a, "redo"),
  when: ctx => ctx.stage.opened !== null,
  enabled: ctx => hasSteps(ctx, "redo"),
})

export const HISTORY_KEYS = [
  kit.defineKey({ id: "undo-mod-z", key: "Mod+Z", command: UNDO.id, scope: "stage" }),
  kit.defineKey({ id: "redo-mod-shift-z", key: "Mod+Shift+Z", command: REDO.id, scope: "stage" }),
  kit.defineKey({ id: "redo-mod-y", key: "Mod+Y", command: REDO.id, scope: "stage" }),
]
