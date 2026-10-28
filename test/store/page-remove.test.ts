// base のアクション page-remove: ページを中身ごと消す。開いていたステージは隣のページを開く
import { expect, test } from "bun:test"
import type { BookOf } from "../../web/src/core/schema/book"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import { newStore } from "../support"

test("@matomezu/base:page-remove はページを消し、開いていたステージは後ろのページを開く。無いページは断る。最後の 1 枚も消せる", () => {
  const store = newStore()
  const { state, actions } = store
  const book = () => state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
  addPageIn(store, "s1", { title: "ページ 2" })
  addPageIn(store, "s1", { title: "ページ 3" })
  const [first, second, third] = book().pages.map(p => p.id) as [string, string, string]
  actions.openPage("s1", second)
  expect(actions.perform("@matomezu/base:page-remove", { page: second }, { book: "b1" }).ok).toBe(true)
  expect(book().pages.map(p => p.id)).toEqual([first, third])
  expect(state.getState().workspace.stages[0]!.opened?.page).toBe(third)
  expect(actions.perform("@matomezu/base:page-remove", { page: "nope" }, { book: "b1" }).ok).toBe(false)
  for (const p of [first, third]) actions.perform("@matomezu/base:page-remove", { page: p }, { book: "b1" })
  expect(book().pages).toEqual([])
  expect(state.getState().workspace.stages[0]!.opened?.page).toBeNull()
})
