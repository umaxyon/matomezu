// フローチャートのページの画面のテストの手伝い
import { expect } from "bun:test"
import { act } from "@testing-library/react"
import { pagesOf } from "../../../../web/src/core/book"
import type { Book } from "../../../../web/src/core/schema/book"
import { screenOf } from "../../../../web/src/core/window"
import { addPageIn, createBookIn } from "../../../../web/src/plugins/base"
import { renderScreen } from "../../../ui/support"

// ブックを作り、フローチャートのページを 1 つ足して開く
export function flowchart() {
  const store = renderScreen()
  act(() => {
    expect(createBookIn(store, "s1", { title: "流れ" })).toBe(true)
  })
  const id = (screenOf(store.state.getState().window).stages[0]!.opened as { outermost: { id: string } }).outermost.id
  act(() => {
    expect(addPageIn(store, "s1", { type: "@matomezu/flowchart:flowchart", title: "p1" })).toBe(true)
  })
  const book = () => store.state.getState().books[id] as Book
  const page = () => pagesOf(book())[0]!
  return { store, on: { book: id }, book, page }
}
