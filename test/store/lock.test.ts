// ロック: ロック中のブック・ページは利用者も AI も変えられない（core の perform が前と後を比べて断る）。外せるのは利用者だけ
import { expect, test } from "bun:test"
import { type PerformedIn, performIn } from "../../web/src/core/perform"
import type { BookOf } from "../../web/src/core/schema/book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { CORE_CATALOG, newStore } from "../support"

type Drawing = BookOf<"@matomezu/drawing:drawing">

test("ロック中のブックは変えられず（理由は locked）、外せば変えられる。locked は title の次に並ぶ", () => {
  const { state, actions } = newStore()
  const book = () => state.getState().books.b1 as Drawing
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  expect(Object.keys(book()).slice(0, 4)).toEqual(["type", "id", "title", "locked"])
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(false)
  expect(actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" })).toEqual({
    ok: false,
    reason: "locked",
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
    expect(actions.perform(id, args, { book: "b1" })).toEqual({ ok: false, reason: "locked" })
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
