// 検索: 探せるブック（見せ方がフィールド search を持つ）で、検索ダイアログを開き、当たりの次・前へ移り、置き換える。
// 開いている間の検索は base のステージの画面の状態（state.ts）。ダイアログは SearchDialog.tsx、探す計算は search.ts・find.ts
import type { CommandActions, CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"
import { PAGE_UPDATE } from "../page-tabs/page-update"
import { hitsIn, pagesOf, replaceAllArgs, replaceOneStep, searchableOf, stepHit } from "./search"
import { NEW_SEARCH, type SearchOpen, searchIn, searchPickIn, withSearch, withSearchPick } from "./state"

// 開いているブックが探せるか
const searchable = (ctx: CommandContext) => searchableOf(ctx.catalog, ctx.book) !== "none"
// 検索ダイアログを開いているか
const opened = (ctx: CommandContext) => searchable(ctx) && searchIn(ctx.stageState) !== null

// 範囲 scope・焦点 focus で検索ダイアログを開く（開いていれば、探す字と切り替えはそのままで範囲と焦点だけ変える。閉じると探す字も消える）
const open = (scope: SearchOpen["scope"] | "keep", focus: SearchOpen["focus"]) => ({
  run: (_ctx: CommandContext, a: CommandActions) =>
    a.updateStageState(now => {
      const was = searchIn(now)
      const base = was ?? { ...NEW_SEARCH, scope: "page" as const, focus, opened: 0 }
      return withSearch(now, {
        ...base,
        scope: scope === "keep" ? base.scope : scope,
        focus,
        opened: base.opened + 1,
      })
    }),
  when: searchable,
})

export const SEARCH_OPEN = kit.defineCommand({
  id: "search-open",
  title: "Search in the page",
  ...open("page", "find"),
})
export const SEARCH_OPEN_BOOK = kit.defineCommand({
  id: "search-open-book",
  title: "Search in the book",
  ...open("book", "find"),
})
export const SEARCH_OPEN_REPLACE = kit.defineCommand({
  id: "search-open-replace",
  title: "Search and replace",
  ...open("keep", "replace"),
})

// 今の当たり（無ければ開いているページの頭）から向き direction の次の当たりへ移る（ほかのページならそのページを開く）
function step(ctx: CommandContext, a: CommandActions, direction: "forward" | "backward") {
  const search = searchIn(ctx.stageState)
  const s = searchableOf(ctx.catalog, ctx.book)
  if (!search || s === "none" || !ctx.book) return
  const pages = hitsIn(s, ctx.book, search.query, search.scope, ctx.stage.opened?.page ?? null)
  if (pages === "bad-pattern") return
  const cur = search.current
  const from =
    cur === "none"
      ? { page: ctx.stage.opened?.page ?? "", at: direction === "forward" ? 0 : Number.POSITIVE_INFINITY }
      : { page: cur.page, at: direction === "forward" ? cur.start + 1 : cur.start }
  const next = stepHit(pages, from, direction, search.wrap)
  if (next === "none") return
  a.updateStageState(now => withSearch(now, { ...search, current: next }))
  if (next.page !== ctx.stage.opened?.page) a.openPage(ctx.stage.id, next.page)
}
export const SEARCH_NEXT = kit.defineCommand({
  id: "search-next",
  title: "Next hit",
  run: (ctx, a) => step(ctx, a, "forward"),
  when: opened,
})
export const SEARCH_PREVIOUS = kit.defineCommand({
  id: "search-previous",
  title: "Previous hit",
  run: (ctx, a) => step(ctx, a, "backward"),
  when: opened,
})

// 閉じる。今の当たりは、ビューが選べるように searchPick に残す
export const SEARCH_CLOSE = kit.defineCommand({
  id: "search-close",
  title: "Close search",
  run: (_ctx, a) =>
    a.updateStageState(now => {
      const search = searchIn(now)
      const closed = withSearch(now, null)
      if (!search || search.current === "none") return closed
      return withSearchPick(closed, { ...search.current, n: (searchPickIn(now)?.n ?? 0) + 1 })
    }),
  when: opened,
})

// 今の当たりを置き換えて、次の当たりへ移る（今の当たりが無いか、もう当たりでなければ、置き換えずに次の当たりへ移るだけ）
export const SEARCH_REPLACE_ONE = kit.defineCommand({
  id: "search-replace-one",
  title: "Replace one",
  performs: [PAGE_UPDATE.id],
  permissionScope: ctx => {
    const cur = searchIn(ctx.stageState)?.current
    return { page: cur && cur !== "none" ? cur.page : (ctx.stage.opened?.page ?? undefined) }
  },
  run: (ctx, a) => {
    const search = searchIn(ctx.stageState)
    const s = searchableOf(ctx.catalog, ctx.book)
    if (!search || s === "none" || !ctx.book) return
    const { args, next } = replaceOneStep(s, ctx.book, search, ctx.stage.opened?.page ?? null)
    if (args !== "none" && !a.perform(PAGE_UPDATE.id, args, { book: ctx.book.id }).ok) return
    a.updateStageState(now => withSearch(now, { ...search, current: next }))
    if (next !== "none" && next.page !== ctx.stage.opened?.page) a.openPage(ctx.stage.id, next.page)
  },
  when: opened,
})

// 範囲の当たりを全部置き換える（範囲がブック全体なら全部のページ。同じ処理の中で行うので、元に戻す 1 回で全部戻る）
export const SEARCH_REPLACE_ALL = kit.defineCommand({
  id: "search-replace-all",
  title: "Replace all",
  performs: [PAGE_UPDATE.id],
  permissionScope: ctx =>
    searchIn(ctx.stageState)?.scope === "book" ? { allPages: true } : { page: ctx.stage.opened?.page ?? undefined },
  run: (ctx, a) => {
    const search = searchIn(ctx.stageState)
    const s = searchableOf(ctx.catalog, ctx.book)
    if (!search || s === "none" || !ctx.book) return
    const book = ctx.book
    const pages = pagesOf(book).filter(p => search.scope === "book" || p.id === ctx.stage.opened?.page)
    for (const page of pages) {
      const args = replaceAllArgs(s, page, search.query, search.replacement)
      if (args !== "none") a.perform(PAGE_UPDATE.id, args, { book: book.id })
    }
    a.updateStageState(now => withSearch(now, { ...search, current: "none" }))
  },
  when: opened,
})

export const SEARCH_COMMANDS = [
  SEARCH_OPEN,
  SEARCH_OPEN_BOOK,
  SEARCH_OPEN_REPLACE,
  SEARCH_NEXT,
  SEARCH_PREVIOUS,
  SEARCH_CLOSE,
  SEARCH_REPLACE_ONE,
  SEARCH_REPLACE_ALL,
] as const

// 検索ダイアログの入力Formが名乗るキーの範囲（Enter・Shift+Enter で次・前、Escape で閉じる）
export const SEARCH_KEY_SCOPE = kit.defineKeyScope({ id: "search", title: "Search" })

export const SEARCH_KEYS = [
  kit.defineKey({ id: "search-open-mod-f", key: "Mod+F", command: SEARCH_OPEN.id, scope: "stage" }),
  kit.defineKey({
    id: "search-open-book-mod-shift-f",
    key: "Mod+Shift+F",
    command: SEARCH_OPEN_BOOK.id,
    scope: "stage",
  }),
  kit.defineKey({
    id: "search-open-replace-mod-alt-f",
    key: "Mod+Alt+F",
    command: SEARCH_OPEN_REPLACE.id,
    scope: "stage",
  }),
  kit.defineKey({ id: "search-next-f3", key: "F3", command: SEARCH_NEXT.id, scope: "stage" }),
  kit.defineKey({ id: "search-previous-shift-f3", key: "Shift+F3", command: SEARCH_PREVIOUS.id, scope: "stage" }),
  kit.defineKey({ id: "search-next-enter", key: "Enter", command: SEARCH_NEXT.id, scope: SEARCH_KEY_SCOPE.id }),
  kit.defineKey({
    id: "search-previous-shift-enter",
    key: "Shift+Enter",
    command: SEARCH_PREVIOUS.id,
    scope: SEARCH_KEY_SCOPE.id,
  }),
  kit.defineKey({ id: "search-next-in-f3", key: "F3", command: SEARCH_NEXT.id, scope: SEARCH_KEY_SCOPE.id }),
  kit.defineKey({
    id: "search-previous-in-shift-f3",
    key: "Shift+F3",
    command: SEARCH_PREVIOUS.id,
    scope: SEARCH_KEY_SCOPE.id,
  }),
  kit.defineKey({ id: "search-close-escape", key: "Escape", command: SEARCH_CLOSE.id, scope: SEARCH_KEY_SCOPE.id }),
]
