// ex8（自分の見せ方を持つ）で、見せ方のビューが開いたページのカードを描き、ページのフィールド cards を base の page-update で変えると描き直すのを確かめる
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { addPageIn, createBookIn, themeFits, themesFor } from "matomezu"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, Screen } from "matomezu/testing"
import EX8_UI from "../ui"

afterEach(cleanup)

test("単語帳を開くと、カードの見せ方のビューがページのカードを並べる（カードが無ければ無いと出す）", () => {
  const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX8_UI], home: "@matomezu/master:master", lang: "ja" })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <Screen />
    </MatomezuProvider>,
  )
  act(() => {
    expect(createBookIn(instance, "s1", { title: "単語帳", type: "ex8:deck" })).toBe(true)
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(addPageIn(instance, "s1", { title: "1" })).toBe(true)
  })
  expect(document.querySelector("[data-ex8-deck]")?.textContent).toBe("カードがありません")
  const page = (instance.state.getState().books[book] as unknown as { pages: { id: string }[] }).pages[0]!.id
  act(() => {
    expect(
      instance.actions.perform(
        "@matomezu/base:page-update",
        { page, fields: { cards: ["りんご", "みかん"] } },
        { book },
      ).ok,
    ).toBe(true)
  })
  expect([...document.querySelectorAll("[data-ex8-card]")].map(c => c.textContent)).toEqual(["りんご", "みかん"])
})

test("自分で足したテーマタイプのテーマ（黒板）は、それを使う単語帳のブックでだけ使え、図面のブックでは使えない", () => {
  const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX8_UI], home: "@matomezu/master:master", lang: "ja" })
  const catalog = instance.catalog.core
  expect(themesFor(catalog, "ex8:deck").map(t => t.id)).toEqual(["@matomezu/base:standard", "ex8:chalk"])
  expect(themeFits(catalog, "@matomezu/drawing:drawing", "ex8:chalk")).toBe(false)
})
