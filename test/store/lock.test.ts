// ロック: ロック中のブック・ページは利用者も AI も変えられない（許可の段 lock が止める）。外せるのは利用者だけ
import { expect, test } from "bun:test"
import { changesOf } from "../../web/src/core/changes"
import { type PerformedIn, performIn } from "../../web/src/core/perform"
import type { Book, BookOf } from "../../web/src/core/schema/book"
import { LOCK } from "../../web/src/plugins/base/lock"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { CORE_CATALOG, newStore } from "../support"

type Drawing = BookOf<"@matomezu/drawing:drawing">

test("ロック中のブックは変えられず（許可の段 lock が止める）、外せば変えられる。locked は title の次に並ぶ", () => {
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
