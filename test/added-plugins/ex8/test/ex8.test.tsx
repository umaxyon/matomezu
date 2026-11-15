// ex8（自分の見せ方を持つ）で、見せ方のビューが開いたページのカードを描き、ページのフィールド cards を base の page-update で変えると描き直すのを確かめる

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { addPageIn, createBookIn, themeFits, themesFor } from "matomezu"
import {
  BUILTIN_UI,
  createMatomezu,
  DEFAULT_LAYOUT,
  MatomezuProvider,
  openedIn,
  placeAdded,
  stagePlacesOf,
  WindowRoot,
  withStagePlaces,
} from "matomezu/testing"
import { pagesOf } from "../../../../web/src/core/book"
import EX8_UI from "../ui"

afterEach(cleanup)

test("単語帳を開くと、カードの見せ方のビューがページのカードを並べる（カードが無ければ無いと出す）", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, EX8_UI],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  act(() => {
    expect(createBookIn(instance, "s1", { title: "単語帳" })).toBe(true)
  })
  const book = (openedIn(instance) as { book: string }).book
  act(() => {
    expect(addPageIn(instance, "s1", { type: "ex8:deck", title: "1" })).toBe(true)
  })
  expect(document.querySelector("[data-ex8-deck] p")?.textContent).toBe("カードがありません")
  const page = pagesOf(instance.state.getState().books[book]!)[0]!.id
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
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, EX8_UI],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  const catalog = instance.catalog.core
  expect(themesFor(catalog, "ex8:deck").map(t => t.id)).toEqual(["@matomezu/base:standard", "ex8:chalk"])
  expect(themeFits(catalog, "@matomezu/drawing:drawing", "ex8:chalk")).toBe(false)
})

test("カードの並べ方は画面の場所に入り（読み直しても戻る）、押して選んだカードは入らない", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, EX8_UI],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  act(() => {
    createBookIn(instance, "s1", { title: "単語帳" })
    addPageIn(instance, "s1", { type: "ex8:deck", title: "1" })
  })
  const book = (openedIn(instance) as { book: string }).book
  const page = pagesOf(instance.state.getState().books[book]!)[0]!.id
  act(() => {
    instance.actions.perform(
      "@matomezu/base:page-update",
      { page, fields: { cards: ["みかん", "りんご", "いちご"] } },
      { book },
    )
  })
  const words = () => [...document.querySelectorAll("[data-ex8-card]")].map(c => c.textContent)
  act(() => (document.querySelector("[data-ex8-deck] button") as HTMLButtonElement).click())
  expect(words()).toEqual(["いちご", "みかん", "りんご"])
  act(() => {
    document.querySelectorAll("[data-ex8-card]")[1]!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
  })
  const placed = instance.address()
  expect(stagePlacesOf(placed)[0]!.states).toEqual({ "ex8:order": "sorted" })
  // 並べ方の無い場所を当てはめると書いた順に戻り、選んだカードはそのまま
  act(() => instance.locate(withStagePlaces(placed, [{ ...stagePlacesOf(placed)[0]!, states: {} }])))
  expect(words()).toEqual(["みかん", "りんご", "いちご"])
  expect(document.querySelectorAll("[data-ex8-card]")[1]!.getAttribute("data-picked")).toBe("true")
  act(() => instance.locate(placed))
  expect(words()).toEqual(["いちご", "みかん", "りんご"])
})
