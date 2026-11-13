// ex13 のスクリーン: 条件で読んだメモを並べ、済みにすると消える
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, WindowRoot } from "matomezu/testing"
import EX13_UI from "../ui"

afterEach(cleanup)

test("メモのスクリーン: このボードの済んでいないメモを新しい順に出し、✓ で済みにすると消える", () => {
  const m = createMatomezu({
    plugins: [...BUILTIN_UI, EX13_UI],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  for (const t of ["a1", "a2", "a3"]) m.actions.perform("ex13:memo-add", { board: "a", text: t })
  m.actions.perform("ex13:memo-add", { board: "b", text: "b1" })
  render(
    <MatomezuProvider instance={m} layout={placeAdded(DEFAULT_LAYOUT, m.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  act(() => {
    m.actions.openScreen("ex13:memo-screen", { board: "a" })
  })
  const items = () => [...document.querySelectorAll("li")].map(li => li.firstChild?.textContent)
  expect(items()).toEqual(["a3", "a2", "a1"])
  fireEvent.click(screen.getAllByRole("button", { name: "✓" })[0] as HTMLElement)
  expect(items()).toEqual(["a2", "a1"])
})
