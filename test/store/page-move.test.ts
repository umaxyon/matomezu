// base のアクション page-move: ページタブの並びを入れ替える（動かすページを除いて数える）。画面の履歴で戻せる。ブックのロックだけが止める
import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { newStore } from "../support"

function setup() {
  const store = newStore()
  const book = () => store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
  addPageIn(store, "s1", { title: "ページ 2" })
  addPageIn(store, "s1", { title: "ページ 3" })
  const ids = book().pages.map(p => p.id)
  const order = () => book().pages.map(p => ids.indexOf(p.id))
  const move = (page: number, index?: number) =>
    store.actions.perform("@matomezu/base:page-move", { page: ids[page] as string, index }, { book: "b1" })
  return { store, book, order, move, ids }
}

test("@matomezu/base:page-move は動かすページを除いて数えた index に動かす。省略は末尾", () => {
  const { order, move } = setup()
  expect(move(0, 2).ok).toBe(true)
  expect(order()).toEqual([1, 2, 0])
  expect(move(2, 0).ok).toBe(true)
  expect(order()).toEqual([2, 1, 0])
  expect(move(2).ok).toBe(true)
  expect(order()).toEqual([1, 0, 2])
})

test("無いページ・並びの外の index・今と同じ所は断る。ロック中のページは動かせるが、ロック中のブックは断る", () => {
  const { store, order, move, ids } = setup()
  const { actions } = store
  expect(actions.perform("@matomezu/base:page-move", { page: "nope", index: 0 }, { book: "b1" }).ok).toBe(false)
  expect(move(0, 3).ok).toBe(false)
  expect(move(1, 1).ok).toBe(false)
  expect(move(2).ok).toBe(false)
  expect(actions.perform("@matomezu/base:page-lock", { page: ids[0] as string }, { book: "b1" }).ok).toBe(true)
  expect(move(1, 0).ok).toBe(true)
  expect(order()).toEqual([1, 0, 2])
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  expect(move(0, 2).ok).toBe(false)
})
