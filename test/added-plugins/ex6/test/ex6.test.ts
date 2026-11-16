// ex6 だけで組む: "ex6:weight" に答える形が無ければ、ページの重さは 0（答えない形は数えない）

import { expect, test } from "bun:test"
import { act } from "@testing-library/react"
import { addPageIn, createBookIn, pagesOf } from "matomezu"
import { BUILTIN_UI, createMatomezu, openedIn } from "matomezu/testing"
import EX6_UI from "../ui"

test("答える形の無いページの重さは 0", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, EX6_UI],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  act(() => {
    expect(createBookIn(instance, "s1", { title: "図" })).toBe(true)
  })
  const book = (openedIn(instance) as { book: string }).book
  act(() => {
    expect(addPageIn(instance, "s1", { type: "@matomezu/drawing:drawing", title: "p1" })).toBe(true)
  })
  const page = pagesOf(instance.state.getState().books[book]!)[0]!.id
  act(() => {
    expect(
      instance.actions.perform(
        "@matomezu/paper:item-place",
        { item: "@matomezu/box:shape-nest-box", at: { x: 40, y: 40 } },
        { page },
      ),
    ).toMatchObject({ ok: true })
  })
  expect(instance.actions.perform("ex6:page-weight", {}, { page })).toMatchObject({ ok: true, result: { weight: 0 } })
})
