// base のアクション page-remove: ページを中身ごと消す。開いていたステージは隣のページを開く

import { expect, test } from "bun:test"
import { pagesOf } from "../../../web/src/core/book"
import type { Book } from "../../../web/src/core/schema/book"
import { shownPageId } from "../../../web/src/core/stage"
import { screenOf } from "../../../web/src/core/window"
import { addPageIn } from "../../../web/src/plugins/base/page-tabs/add-page"
import { newStore } from "../../support"

test("@matomezu/base:page-remove はページを消し、開いていたステージは後ろのページを開く。無いページは断る。最後の 1 枚も消せる", () => {
  const store = newStore()
  const { state, actions } = store
  const book = () => state.getState().books.b1 as Book
  addPageIn(store, "s1", { type: "@matomezu/drawing:drawing", title: "ページ 2" })
  addPageIn(store, "s1", { type: "@matomezu/drawing:drawing", title: "ページ 3" })
  const [first, second, third] = pagesOf(book()).map(p => p.id) as [string, string, string]
  actions.openPage("s1", second)
  expect(actions.perform("@matomezu/base:page-remove", { page: second }, { book: "b1" }).ok).toBe(true)
  expect(pagesOf(book()).map(p => p.id)).toEqual([first, third])
  expect(shownPageId(screenOf(state.getState().window).stages[0]!.opened ?? null)).toBe(third)
  expect(actions.perform("@matomezu/base:page-remove", { page: "nope" }, { book: "b1" }).ok).toBe(false)
  for (const p of [first, third]) actions.perform("@matomezu/base:page-remove", { page: p }, { book: "b1" })
  expect(pagesOf(book())).toEqual([])
  expect(shownPageId(screenOf(state.getState().window).stages[0]!.opened ?? null)).toBeNull()
})
