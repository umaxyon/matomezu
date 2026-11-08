// 検索（base/search）: 探せるブック（マークダウン）で検索ダイアログを開き、次・前へ移り（ページをまたぐ）、置き換え、閉じる
import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { createBookIn } from "../../web/src/plugins/base/book-new/create-book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { searchIn, searchPickIn, withSearch } from "../../web/src/plugins/base/search/state"
import { isShown } from "../../web/src/store/commands"
import { newStore } from "../support"

const BASE = "@matomezu/base"

function markdownStore(texts: readonly string[]) {
  const store = newStore()
  createBookIn(store, "s1", { title: "メモ", type: "@matomezu/markdown:markdown" })
  for (const [i, text] of texts.entries()) addPageIn(store, "s1", { title: `p${i + 1}`, fields: { text } })
  const id = store.state.getState().workspace.stages[0]!.opened!.book
  const book = () => store.state.getState().books[id] as BookOf<"@matomezu/markdown:markdown">
  const pages = () => book().pages.map(p => p.id)
  const search = () => searchIn(store.state.getState().stageStates.s1?.[BASE])
  const setQuery = (text: string, more: object = {}) =>
    store.setStageState(
      "s1",
      BASE,
      withSearch(store.state.getState().stageStates.s1?.[BASE], {
        ...search()!,
        query: { ...search()!.query, text },
        ...more,
      }),
    )
  return { store, book, pages, search, setQuery }
}

test("探せないブック（図面）では検索のコマンドを出さず、マークダウンでは出す", () => {
  const plain = newStore()
  expect(isShown(plain, plain.state.getState(), "s1", "@matomezu/base:search-open")).toBe(false)
  const { store } = markdownStore(["a"])
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/base:search-open")).toBe(true)
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/base:search-next")).toBe(false)
})

test("開いたページの中で次・前へ回り、端で止めることもできる。閉じると今の当たりを選ぶ所として残す", () => {
  const { store, pages, search, setQuery } = markdownStore(["cat dog cat"])
  const { actions, state } = store
  actions.command("s1", "@matomezu/base:search-open")
  expect(search()).toMatchObject({ scope: "page", focus: "find", current: "none" })
  setQuery("cat")
  actions.command("s1", "@matomezu/base:search-next")
  expect(search()!.current).toEqual({ page: pages()[0]!, start: 0, end: 3 })
  actions.command("s1", "@matomezu/base:search-next")
  expect(search()!.current).toMatchObject({ start: 8 })
  actions.command("s1", "@matomezu/base:search-next")
  expect(search()!.current).toMatchObject({ start: 0 })
  actions.command("s1", "@matomezu/base:search-previous")
  expect(search()!.current).toMatchObject({ start: 8 })
  setQuery("cat", { wrap: false })
  actions.command("s1", "@matomezu/base:search-next")
  expect(search()!.current).toMatchObject({ start: 8 })
  actions.command("s1", "@matomezu/base:search-close")
  expect(search()).toBeNull()
  expect(searchPickIn(state.getState().stageStates.s1?.[BASE])).toMatchObject({ start: 8, end: 11, n: 1 })
})

test("ブック全体では、当たりのある次のページを開いて移り、最後のページの次は最初のページに戻る", () => {
  const { store, pages, search, setQuery } = markdownStore(["x", "a x", "x"])
  const { actions, state } = store
  actions.openPage("s1", pages()[0]!)
  actions.command("s1", "@matomezu/base:search-open-book")
  setQuery("x")
  const opened = () => state.getState().workspace.stages[0]!.opened!.page
  actions.command("s1", "@matomezu/base:search-next")
  expect([opened(), search()!.current]).toEqual([pages()[0], { page: pages()[0], start: 0, end: 1 }])
  actions.command("s1", "@matomezu/base:search-next")
  expect([opened(), search()!.current]).toEqual([pages()[1], { page: pages()[1], start: 2, end: 3 }])
  actions.command("s1", "@matomezu/base:search-next")
  actions.command("s1", "@matomezu/base:search-next")
  expect(opened()).toBe(pages()[0])
})

test("1 つ置換は今の当たりだけを替えて次へ、全部置換は範囲の全部を替え、元に戻す 1 回で全部戻る", () => {
  const { store, book, pages, search, setQuery } = markdownStore(["cat cat", "cat"])
  const { actions } = store
  actions.openPage("s1", pages()[0]!)
  actions.command("s1", "@matomezu/base:search-open-book")
  setQuery("cat", { replacement: "dog" })
  actions.command("s1", "@matomezu/base:search-next")
  actions.command("s1", "@matomezu/base:search-next")
  expect(search()!.current).toMatchObject({ start: 4 })
  actions.command("s1", "@matomezu/base:search-replace-one")
  expect(book().pages.map(p => p.text)).toEqual(["cat dog", "cat"])
  actions.command("s1", "@matomezu/base:search-replace-all")
  expect(book().pages.map(p => p.text)).toEqual(["dog dog", "dog"])
  actions.command("s1", "@matomezu/base:undo")
  expect(book().pages.map(p => p.text)).toEqual(["cat dog", "cat"])
})
