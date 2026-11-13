import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, WindowRoot } from "matomezu/testing"
import EX10_UI from "../ui"

afterEach(cleanup)

const make = () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, EX10_UI],
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  return instance
}

test("ステージに結ばない宣言の値を押して変えると、画面の場所に入り、積むと宣言したので移動になる", () => {
  const instance = make()
  const before = instance.address()
  expect(before.window).toEqual({})
  fireEvent.click(screen.getByRole("button", { name: "タブ 2" }))
  const after = instance.address()
  expect(after.window).toEqual({ "ex10:tab": "two" })
  expect(instance.pushing().has("ex10:tab")).toBe(true)
  expect(document.querySelector("[data-ex10-tabs]")?.getAttribute("data-tab")).toBe("two")
})

test("場所の値を当てはめると宣言の値が丸ごと置き換わり、形に合わない値と知らない id は落ちる", () => {
  const instance = make()
  const at = instance.address()
  act(() => instance.locate({ ...at, window: { "ex10:tab": "two", "ex10:nope": 1 } }))
  expect(instance.address().window).toEqual({ "ex10:tab": "two" })
  act(() => instance.locate({ ...at, window: { "ex10:tab": "three" } }))
  expect(instance.address().window).toEqual({})
  act(() => instance.locate({ ...at, window: {} }))
  expect(document.querySelector("[data-ex10-tabs]")?.getAttribute("data-tab")).toBe("one")
})
