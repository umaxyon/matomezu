// ゴミ箱: book-trash はブックに入れた時刻を付けて一覧から外し（開いていたステージは何も開かない）、book-restore は戻し、
// book-purge と trash-empty はゴミ箱から消す。1 冊だけのタイプ・ロック中は入れない。ゴミ箱のブックはブックが対象のアクションで変えられない
import { expect, test } from "bun:test"
import { memoryClient } from "../../web/src/host-client/memory"
import { createBookIn } from "../../web/src/plugins/base/book-new/create-book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { newStore } from "../support"

const NOW = "2026-10-29T01:00:00.000Z"

test("book-trash はブックに時刻を付けてゴミ箱へ移し、開いていたステージは何も開かない。無いブックと 1 冊だけのタイプは断る", () => {
  const { state, actions } = newStore({ now: () => NOW })
  expect(actions.perform("@matomezu/base:book-trash", { book: "b1" }).ok).toBe(true)
  expect("b1" in state.getState().books).toBe(false)
  expect(state.getState().trash.b1?.trashed).toBe(NOW)
  expect(Object.keys(state.getState().trash.b1 ?? {}).slice(0, 4)).toEqual(["type", "id", "title", "trashed"])
  expect(state.getState().workspace.stages[0]?.opened).toBeNull()
  expect(actions.perform("@matomezu/base:book-trash", { book: "b1" }).ok).toBe(false)
  expect(actions.perform("@matomezu/base:book-trash", { book: MASTER_BOOK.id }).ok).toBe(false)
})

test("ゴミ箱のブックは、ブックが対象のアクションでは無いものとして断る", () => {
  const { actions } = newStore()
  actions.perform("@matomezu/base:book-trash", { book: "b1" })
  expect(actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" })).toEqual({
    ok: false,
    reason: "no-book",
  })
})

test("ロック中のブックと、ロック中のページを持つブックはゴミ箱に入れられない（locked）", () => {
  const store = newStore()
  const { actions } = store
  addPageIn(store, "s1", { title: "ページ 2" })
  const page = (store.state.getState().books.b1 as { pages: { id: string }[] }).pages[1]?.id as string
  actions.perform("@matomezu/base:page-lock", { page }, { book: "b1" })
  expect(actions.perform("@matomezu/base:book-trash", { book: "b1" })).toEqual({ ok: false, reason: "locked" })
  actions.perform("@matomezu/base:page-unlock", { page }, { book: "b1" })
  actions.perform("@matomezu/base:book-lock", {}, { book: "b1" })
  expect(actions.perform("@matomezu/base:book-trash", { book: "b1" })).toEqual({ ok: false, reason: "locked" })
})

test("戻す・消す・空にする。ゴミ箱に無いブックは戻さず消さない。メモリのホストは残したブックを合わせる", async () => {
  const host = memoryClient([])
  const store = newStore({ books: [], savedBooks: (await host.load()).books })
  host.connect(store)
  const made = ["一", "二", "三"].map(title => {
    createBookIn(store, "s1", { title, type: "@matomezu/drawing:drawing" })
    return Object.values(store.state.getState().books).find(b => b.title === title)?.id as string
  })
  const [one, two, three] = made as [string, string, string]
  const { perform } = store.actions
  expect(perform("@matomezu/base:book-restore", { book: one }).ok).toBe(false)
  expect(perform("@matomezu/base:book-purge", { books: [one] }).ok).toBe(false)
  for (const id of made) perform("@matomezu/base:book-trash", { book: id })
  const trash = () =>
    Object.values(store.state.getState().trash)
      .map(b => b.title)
      .sort()
  expect(trash()).toEqual(["一", "三", "二"])
  expect(perform("@matomezu/base:book-restore", { book: one }).ok).toBe(true)
  expect(trash()).toEqual(["三", "二"])
  expect(store.state.getState().books[one]?.trashed).toBeUndefined()
  expect(host.books.get(one)?.trashed).toBeUndefined()
  expect(perform("@matomezu/base:book-purge", { books: [two] }).ok).toBe(true)
  expect(trash()).toEqual(["三"])
  expect(host.books.has(two)).toBe(false)
  expect(perform("@matomezu/base:trash-empty", {}).ok).toBe(true)
  expect(trash()).toEqual([])
  expect(three in store.state.getState().books || host.books.has(three)).toBe(false)
  expect(host.books.has(one)).toBe(true)
})
