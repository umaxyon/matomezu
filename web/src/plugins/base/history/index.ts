// 画面の履歴（Undo・Redo）: 戻す・やり直すコマンドと、画面の履歴の段が変えた所を置き直すアクション（history-revert）。履歴は store が、利用者が画面で
// 行ったアクションと、その窓で見えた AI とほかの窓の変更から作る（ロックの掛け外しのように history: false のアクションは入らない）。
// 戻すのは、カレントのステージで開いているステージエントリ（ブックか、ブックの外のページか、ブックの外のバインダ）の最後の画面の履歴の段。その画面の履歴の段がいくつかのステージエントリを変えていれば、その全部を戻す

import { pagesOf } from "../../../core/book"
import { CREATES_NOTHING, type LibraryTargets } from "../../../core/def/action"
import { NO_NAME } from "../../../core/entries"
import type { Folders } from "../../../core/folders"
import { foldersOver, inTrash } from "../../../core/folders-tree"
import type { HistoryStep } from "../../../core/history"
import type { MessageKey } from "../../../core/i18n/i18n"
import type { Books } from "../../../core/library"
import { NOTHING_OPENED, shownPageId } from "../../../core/stage"
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
  // ブックの外のページは、そのページの全部を、ブックの外のバインダは、中のページの全部を変えるとして問う
  permissionScope: (args: RevertArgs): LibraryTargets => {
    const pages = restoredPages(args.pages)
    const [page] = pages
    const books = args.outermosts.filter(e => e.kind === "book")
    const one = args.outermosts.length === 1 && pages.length === 1 ? page : undefined
    const where = one ? { page: one.id, ...(one.items ? { items: [...one.items] } : {}) } : {}
    return {
      books: books.map(e => ({ book: e.id, where })),
      entries: args.outermosts.filter(e => e.kind !== "book").map(e => ({ entry: e.id, where: "all-pages" })),
      creates: CREATES_NOTHING,
    }
  },
  args: RevertArgs,
  run: (library, args) => {
    const next = restoredLibrary(library, args.outermosts, args)
    if (next === UNCHANGED) return DECLINED_UNCHANGED
    return next && { next, result: {} }
  },
})

// 画面の履歴の鍵 id のステージエントリの種類: フォルダの表 folders でブックの行ならブック、バインダの行ならブックの外のバインダ、ほかはブックの外のページ（置き直しのアクションが、実体で確かめ直す）
const kindOf = (folders: Folders, id: string): RevertArgs["outermosts"][number]["kind"] => {
  const role = folders[id]?.folderRole
  return role === "book" || role === "binder" ? role : "page"
}

// 置き直したあと、ブックの外のバインダ binder で開いていたいページ: 画面の履歴の段が変えて残るページのうち、今そのバインダに入っているか、どこにも入っていない（置き直しで戻る）最初のページ
function pageToOpenInBinder(
  folders: Folders,
  step: HistoryStep,
  to: "before" | "after",
  binder: string,
): string | undefined {
  const held = (id: string) => {
    const [near] = foldersOver(folders, id)
    return near === undefined || near.id === binder
  }
  return Object.entries(step.pages).find(([id, row]) => row[to] !== "none" && held(id))?.[0]
}

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
  refused: { reason: string; permission?: string | symbol },
  { name, clash }: { name?: string; clash?: MessageKey } = {},
): void {
  const denied =
    refused.reason === "denied" && typeof refused.permission === "string"
      ? ctx.catalog.permissions.get(refused.permission)
      : undefined
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

// 置き直しの答え（行わなかった・置き直す値が無いなら undefined）。認可ステップが止めたなら、止めたブックかページ（book・page）も
type RestoreAnswer =
  | { ok: true }
  | { ok: false; reason: string; kind?: string | symbol; permission?: string | symbol; book?: string; page?: string }

// 置き直しの答え done が決まったら fn に渡す: 画面で行えた・断られたなら今、常駐へ送った（SENT_TO_HOST）なら常駐が行うか断ったとき
// （送った物は、行えたと分かってから画面の履歴の段を動かし、断られたら画面で断られたときと同じに分ける）
export function whenRestored(
  done: RestoreAnswer | { ok: true; confirmed: Promise<RestoreAnswer> } | undefined,
  fn: (answer: RestoreAnswer | undefined) => void,
): void {
  if (done?.ok && "confirmed" in done) void done.confirmed.then(fn)
  else fn(done)
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
  if (opened === NOTHING_OPENED) return
  const to = from === "undo" ? "before" : "after"
  // 一緒に置き直すブック（also）のうち、もうゴミ箱の外のブックでない物は、その行（並び）を置き直さずに外す（段の持ち主のブックは戻せるように）
  const argsOf = (step: HistoryStep) => {
    const also = (step.also ?? []).filter(id => !step.outermosts.includes(id))
    const gone = new Set(also.filter(id => ctx.folders[id]?.folderRole !== "book" || inTrash(ctx.folders, id)))
    const named = [...step.outermosts, ...also.filter(id => !gone.has(id))]
    const folders = Object.fromEntries(Object.entries(step.folders).filter(([id]) => !gone.has(id)))
    return {
      outermosts: named.map(id => ({ kind: kindOf(ctx.folders, id), id })),
      pages: patchesToward(step.pages, to),
      folders: patchesToward(folders, to),
    }
  }
  const changes = (args: RevertArgs) => Object.keys(args.pages).length + Object.keys(args.folders).length > 0
  const steps = [...ctx.history[from]].reverse()
  // 新しい側から i 番目の画面の履歴の段を置き直す（置き直しても何も変わらなければ動かして、次の画面の履歴の段へ）
  const restoreAt = (i: number): void => {
    const step = steps[i]
    if (!step) return
    const args = argsOf(step)
    const { kind, id } = opened.outermost
    const page =
      kind === "book"
        ? pageToOpen(booksOf(ctx), step, to, id, args)
        : kind === "binder"
          ? pageToOpenInBinder(ctx.folders, step, to, id)
          : undefined
    whenRestored(changes(args) ? a.perform(HISTORY_RESTORE.id, args) : undefined, result => {
      if (result && !result.ok && !isRevertUnchanged(result)) {
        const denied = result.reason === "denied" ? result : undefined
        const book = denied?.book ? booksOf(ctx)[denied.book]?.title : undefined
        const page = denied?.page ? ctx.pageTitle(denied.page) : NO_NAME
        notRestored(ctx, a, opened.outermost.id, from, result, {
          name: book ?? (page === NO_NAME ? undefined : page),
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
      if (!result?.ok) return restoreAt(i + 1)
      if (page && page !== shownPageId(opened)) a.openPage(page)
    })
  }
  restoreAt(0)
}

// 開いているステージエントリの画面の履歴に、from の側の段が在るか
const hasSteps = (ctx: CommandContext, from: "undo" | "redo"): boolean => ctx.history[from].length > 0

export const UNDO = kit.defineCommand({
  id: "undo",
  title: "Undo",
  performs: [HISTORY_RESTORE.id],
  whileSent: "waits",
  permissionScope: "book",
  run: (ctx, a) => restore(ctx, a, "undo"),
  when: ctx => ctx.stage.opened !== NOTHING_OPENED,
  enabled: ctx => hasSteps(ctx, "undo"),
})

export const REDO = kit.defineCommand({
  id: "redo",
  title: "Redo",
  performs: [HISTORY_RESTORE.id],
  whileSent: "waits",
  permissionScope: "book",
  run: (ctx, a) => restore(ctx, a, "redo"),
  when: ctx => ctx.stage.opened !== NOTHING_OPENED,
  enabled: ctx => hasSteps(ctx, "redo"),
})

export const HISTORY_KEYS = [
  kit.defineKey({ id: "undo-mod-z", key: "Mod+Z", command: UNDO.id, scope: "stage" }),
  kit.defineKey({ id: "redo-mod-shift-z", key: "Mod+Shift+Z", command: REDO.id, scope: "stage" }),
  kit.defineKey({ id: "redo-mod-y", key: "Mod+Y", command: REDO.id, scope: "stage" }),
]
