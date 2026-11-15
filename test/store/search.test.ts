// 検索（base/search）: 探せるブック（マークダウン）で検索ダイアログを開き、次・前へ移り（ページをまたぐ）、置き換え、閉じる

import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import type { Book } from "../../web/src/core/schema/book"
import { shownPageId } from "../../web/src/core/stage"
import { screenOf } from "../../web/src/core/window"
import { createBookIn } from "../../web/src/plugins/base/book-new/create-book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { SEARCH_PICK_STATE, SEARCH_STATE } from "../../web/src/plugins/base/search/state"
import { isEnabled, isShown } from "../../web/src/store/commands"
import { pluginValueOf } from "../../web/src/store/plugin-state"
import { newStore } from "../support"

function markdownStore(texts: readonly string[]) {
  const store = newStore()
  createBookIn(store, "s1", { title: "メモ" })
  for (const [i, text] of texts.entries())
    addPageIn(store, "s1", {
      type: "@matomezu/markdown:markdown",
      title: `p${i + 1}`,
      fields: { text },
    })
  const id = screenOf(store.state.getState().window).stages[0]!.opened!.book
  const book = () => store.state.getState().books[id] as Book
  const pages = () => pagesOf(book()).map(p => p.id)
  const search = () => pluginValueOf(store.state.getState().pluginValues, "s1", SEARCH_STATE)
  const setQuery = (text: string, more: object = {}) =>
    store.setPluginState("@matomezu/base:search", "s1", {
      ...search()!,
      query: { ...search()!.query, text },
      ...more,
    })
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
  expect(search()).toBeUndefined()
  expect(pluginValueOf(state.getState().pluginValues, "s1", SEARCH_PICK_STATE)).toMatchObject({
    start: 8,
    end: 11,
    n: 1,
  })
})

test("ブック全体では、当たりのある次のページを開いて移り、最後のページの次は最初のページに戻る", () => {
  const { store, pages, search, setQuery } = markdownStore(["x", "a x", "x"])
  const { actions, state } = store
  actions.openPage("s1", pages()[0]!)
  actions.command("s1", "@matomezu/base:search-open-book")
  setQuery("x")
  const opened = () => shownPageId(screenOf(state.getState().window).stages[0]!.opened ?? null)
  actions.command("s1", "@matomezu/base:search-next")
  expect([opened(), search()!.current]).toEqual([pages()[0]!, { page: pages()[0]!, start: 0, end: 1 }])
  actions.command("s1", "@matomezu/base:search-next")
  expect([opened(), search()!.current]).toEqual([pages()[1]!, { page: pages()[1]!, start: 2, end: 3 }])
  actions.command("s1", "@matomezu/base:search-next")
  actions.command("s1", "@matomezu/base:search-next")
  expect(opened()).toBe(pages()[0]!)
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
  expect(pagesOf(book()).map(p => p.text)).toEqual(["cat dog", "cat"])
  actions.command("s1", "@matomezu/base:search-replace-all")
  expect(pagesOf(book()).map(p => p.text)).toEqual(["dog dog", "dog"])
  actions.command("s1", "@matomezu/base:undo")
  expect(pagesOf(book()).map(p => p.text)).toEqual(["cat dog", "cat"])
})

test("長さの違う置き換えでも、1 つ置換のあとの今の当たりは次の当たりを指し、続けて押せる", () => {
  const { store, book, search, setQuery } = markdownStore(["cat cat cat"])
  const { actions } = store
  actions.command("s1", "@matomezu/base:search-open")
  setQuery("cat", { replacement: "x" })
  actions.command("s1", "@matomezu/base:search-next")
  actions.command("s1", "@matomezu/base:search-replace-one")
  expect(pagesOf(book())[0]!.text).toBe("x cat cat")
  expect(search()!.current).toMatchObject({ start: 2, end: 5 })
  actions.command("s1", "@matomezu/base:search-replace-one")
  expect(pagesOf(book())[0]!.text).toBe("x x cat")
})

test("ページにロックが掛かっていると、そのページを替える置換は押せない（ブック全体の全部置換も）", () => {
  const { store, pages, setQuery } = markdownStore(["cat"])
  const { actions, state } = store
  const book = screenOf(state.getState().window).stages[0]!.opened!.book
  actions.command("s1", "@matomezu/base:search-open")
  setQuery("cat", { replacement: "dog" })
  actions.command("s1", "@matomezu/base:search-next")
  const enabled = (id: "@matomezu/base:search-replace-one" | "@matomezu/base:search-replace-all") =>
    isEnabled(store, state.getState(), "s1", id)
  expect(enabled("@matomezu/base:search-replace-one")).toBe(true)
  expect(actions.perform("@matomezu/base:page-lock", { page: pages()[0]! }, { book }).ok).toBe(true)
  expect(enabled("@matomezu/base:search-replace-one")).toBe(false)
  expect(enabled("@matomezu/base:search-replace-all")).toBe(false)
})
