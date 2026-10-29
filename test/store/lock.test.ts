// ロック: ロック中のブック・ページは利用者も AI も変えられない（認可ステップ lock が止める）。外せるのは利用者だけ
import { expect, test } from "bun:test"
import type { MessageKey } from "../../web/src/core/catalog"
import { changesOf } from "../../web/src/core/changes"
import { type PerformedIn, performIn } from "../../web/src/core/perform"
import type { Book, BookOf } from "../../web/src/core/schema/book"
import { refusalMessage } from "../../web/src/plugins/base"
import { LOCK } from "../../web/src/plugins/base/lock"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import type { CommandId } from "../../web/src/store/commands"
import { isEnabled } from "../../web/src/store/commands"
import { CORE_CATALOG, newStore } from "../support"

type Drawing = BookOf<"@matomezu/drawing:drawing">

test("ロック中のブックは変えられず（認可ステップ lock が止める）、外せば変えられる。locked は title の次に並ぶ", () => {
  const { state, actions } = newStore()
  const book = () => state.getState().books.b1 as Drawing
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  expect(Object.keys(book()).slice(0, 4)).toEqual(["type", "id", "title", "locked"])
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(false)
  expect(actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" })).toEqual({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
  })
  expect(actions.perform("@matomezu/base:book-unlock", {}, { book: "b1" }).ok).toBe(true)
  expect("locked" in book()).toBe(false)
  expect(actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" }).ok).toBe(true)
})

test("ロック中のページは変えられず消せない。ほかのページは変えられる", () => {
  const store = newStore()
  const { state, actions } = store
  const book = () => state.getState().books.b1 as Drawing
  addPageIn(store, "s1", { title: "ページ 2" })
  const [first, second] = book().pages.map(p => p.id) as [string, string]
  expect(actions.perform("@matomezu/base:page-lock", { page: first }, { book: "b1" }).ok).toBe(true)
  expect(book().pages[0]?.locked).toBe(true)
  for (const [id, args] of [
    ["@matomezu/base:page-update", { page: first, title: "x" }],
    ["@matomezu/base:page-remove", { page: first }],
  ] as const)
    expect(actions.perform(id, args, { book: "b1" })).toEqual({
      ok: false,
      reason: "denied",
      permission: "@matomezu/base:lock",
    })
  expect(actions.perform("@matomezu/base:page-update", { page: second, title: "y" }, { book: "b1" }).ok).toBe(true)
  expect(actions.perform("@matomezu/base:page-unlock", { page: first }, { book: "b1" }).ok).toBe(true)
  expect(actions.perform("@matomezu/base:page-remove", { page: first }, { book: "b1" }).ok).toBe(true)
})

test("AI はロックを掛けられるが外せない（userOnly のアクションは断る）", () => {
  const { state } = newStore()
  const ctx = (by?: "ai") => ({
    catalog: CORE_CATALOG,
    home: MASTER_BOOK.id,
    lang: "en" as const,
    newId: () => "n",
    now: "2026-10-29T00:00:00.000Z",
    ...(by ? { by } : {}),
  })
  let world = { books: state.getState().books, settings: state.getState().settings }
  const run = (id: string, by?: "ai"): PerformedIn => {
    const done = performIn(world, id, {}, { book: "b1" }, ctx(by))
    if (done.ok && done.book) world = { ...world, books: { ...world.books, [done.book.id]: done.book } }
    return done
  }
  expect(run("@matomezu/base:book-lock", "ai").ok).toBe(true)
  expect(run("@matomezu/base:book-unlock", "ai")).toEqual({ ok: false, reason: "not-allowed" })
  expect(run("@matomezu/base:book-unlock").ok).toBe(true)
})

test("変える所を言わないアクションは、行う前にはページのロックで止めず、行った後の変化で止める", () => {
  const page = { id: "p1", title: "1", locked: true as const }
  const before = { type: "t", id: "b1", title: "", pages: [page] } as unknown as Book
  const action = CORE_CATALOG.actions.get("@matomezu/base:page-update")!
  expect(LOCK.denies({ action, book: before })).toBe(false)
  expect(LOCK.denies({ action, book: before, where: { page: "p1" } })).toBe(true)
  const after = { ...before, pages: [{ ...page, title: "x" }] } as unknown as Book
  expect(LOCK.keeps!({ action, before, after, changes: changesOf(before, after) })).toBe(false)
  const unlocked = { ...before, pages: [{ id: "p1", title: "1" }] } as unknown as Book
  expect(LOCK.keeps!({ action, before, after: unlocked, changes: changesOf(before, unlocked) })).toBe(true)
  expect(LOCK.keeps!({ action, before, after: unlocked, changes: changesOf(before, unlocked), by: "ai" })).toBe(false)
})

test("ロック中は、行うアクションをどれも認可ステップに止められるコマンドを押せない。設定のダイアログはロックを外すために押せる", () => {
  const store = newStore()
  const { state, actions } = store
  addPageIn(store, "s1", { title: "ページ 2" })
  const enabled = (id: CommandId) => isEnabled(store, state.getState(), "s1", id)
  // 箱を置こうとしている（paper-place を出す）
  const placing = () => {
    if (!state.getState().workspace.stages[0]!.placing) actions.togglePlacing("s1", "@matomezu/box:shape-box")
  }
  const first = (state.getState().books.b1 as Drawing).pages[0]!.id
  actions.openPage("s1", first)
  expect(actions.perform("@matomezu/base:page-lock", { page: first }, { book: "b1" }).ok).toBe(true)
  // 開いているページのロック: そのページを変えるコマンドは押せず、ブック単位のコマンドは押せる
  placing()
  expect(enabled("@matomezu/paper:paper-place")).toBe(false)
  expect(enabled("@matomezu/base:page-new")).toBe(true)
  expect(enabled("@matomezu/base:page-settings")).toBe(true)
  actions.openPage("s1", (state.getState().books.b1 as Drawing).pages[1]!.id)
  placing()
  expect(enabled("@matomezu/paper:paper-place")).toBe(true)
  // ブックのロック: ブック単位のコマンドも押せない。ブックの設定は押せる
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  expect(enabled("@matomezu/base:page-new")).toBe(false)
  expect(enabled("@matomezu/paper:paper-place")).toBe(false)
  expect(enabled("@matomezu/base:book-settings")).toBe(true)
  // 一覧のアクションは開いているブックのロックで止めない
  expect(enabled("@matomezu/base:book-new")).toBe(
    isEnabled(newStore(), newStore().state.getState(), "s1", "@matomezu/base:book-new"),
  )
})

test("断りの文言は、認可ステップが止めたならそのステップの名前、ほかの理由なら呼ぶ側の文言", () => {
  const { actions } = newStore()
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  const done = actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" })
  const fallback = "@matomezu/tree:Does not fit on the paper" as MessageKey
  expect(done.ok || refusalMessage(CORE_CATALOG, done, fallback)).toBe(LOCK.title)
  expect(refusalMessage(CORE_CATALOG, { reason: "refused" }, fallback)).toBe(fallback)
})
