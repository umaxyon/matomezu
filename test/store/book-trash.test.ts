// ブックをゴミ箱に入れる: アクション book-trash は一覧から外す（開いていたステージは何も開かない）。1 冊だけのタイプ・ロック中は断る。
// メモリのホストはゴミ箱を覚え、戻す・消すを済ませる
import { expect, test } from "bun:test"
import { memoryClient } from "../../web/src/host-client/memory"
import { createBookIn } from "../../web/src/plugins/base/book-new/create-book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { newStore } from "../support"

test("book-trash はブックを一覧から外し、開いていたステージは何も開かない。無いブックと 1 冊だけのタイプは断る", () => {
  const { state, actions } = newStore()
  expect(actions.perform("@matomezu/base:book-trash", { book: "b1" }).ok).toBe(true)
  expect("b1" in state.getState().books).toBe(false)
  expect(state.getState().workspace.stages[0]?.opened).toBeNull()
  expect(actions.perform("@matomezu/base:book-trash", { book: "b1" }).ok).toBe(false)
  expect(actions.perform("@matomezu/base:book-trash", { book: MASTER_BOOK.id }).ok).toBe(false)
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

test("メモリのホストは、一覧から無くなったブックをゴミ箱に覚え、戻す・消す・空にする", async () => {
  const host = memoryClient([])
  const store = newStore({ books: [], savedBooks: (await host.load()).books, trash: host })
  host.connect(store)
  const made = ["一", "二", "三"].map(title => {
    createBookIn(store, "s1", { title, type: "@matomezu/drawing:drawing" })
    return Object.values(store.state.getState().books).find(b => b.title === title)?.id as string
  })
  const [one, two, three] = made as [string, string, string]
  for (const id of made) store.actions.perform("@matomezu/base:book-trash", { book: id })
  const trash = () =>
    store.state
      .getState()
      .trash.map(b => b.title)
      .sort()
  expect(trash()).toEqual(["一", "三", "二"])
  store.actions.restoreBook(one)
  expect(trash()).toEqual(["三", "二"])
  expect(store.state.getState().books[one]?.title).toBe("一")
  store.actions.purgeBooks([two])
  expect(trash()).toEqual(["三"])
  store.actions.purgeBooks([])
  expect(trash()).toEqual([])
  expect(three in store.state.getState().books).toBe(false)
})
