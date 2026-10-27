// ex6 だけで組む: "ex6:weight" に答える形が無ければ、ページの重さは 0（答えない形は数えない）
import { expect, test } from "bun:test"
import { act } from "@testing-library/react"
import { addPageIn, createBookIn } from "matomezu"
import { BUILTIN_UI, createMatomezu } from "matomezu/testing"
import EX6_UI from "../ui"

test("答える形の無いページの重さは 0", () => {
  const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX6_UI], home: "@matomezu/master:master", lang: "ja" })
  act(() => {
    expect(createBookIn(instance, "s1", { title: "図", type: "@matomezu/drawing:drawing" })).toBe(true)
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(addPageIn(instance, "s1", { title: "p1" })).toBe(true)
  })
  const on = { book }
  const page = (instance.state.getState().books[book] as unknown as { pages: { id: string }[] }).pages[0]!.id
  act(() => {
    expect(
      instance.actions.perform(
        "@matomezu/paper:item-place",
        { page, item: "@matomezu/box:shape-box", at: { x: 40, y: 40 } },
        on,
      ),
    ).toMatchObject({ ok: true })
  })
  expect(instance.actions.perform("ex6:page-weight", { page }, on)).toMatchObject({ ok: true, result: { weight: 0 } })
})
