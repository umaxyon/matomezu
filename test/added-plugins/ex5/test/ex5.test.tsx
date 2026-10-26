// ex5（文字を持たず、中身の欄が children でない形）で、監査 B1〜B3 を確かめる（themeProp の型は type-checks.ts）
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { nextItemId, type PagedBook } from "matomezu"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, Screen } from "matomezu/testing"
import EX5_UI from "../ui"

afterEach(cleanup)

interface Page {
  id: string
  items?: { id: string; item: string; w?: number; tiles?: { id: string }[] }[]
}

const shelf = () => {
  const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX5_UI], home: "@matomezu/master:master", lang: "ja" })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <Screen />
    </MatomezuProvider>,
  )
  act(() => {
    expect(instance.actions.createBook("s1", { title: "棚", type: "ex5:shelf" })).toBe(true)
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(instance.actions.addPage("s1", { title: "p1" })).toBe(true)
  })
  const on = { book }
  const page = () => (instance.state.getState().books[book] as unknown as { pages: Page[] }).pages[0]!
  const place = (props: { theme?: "warm" | "cool"; caption?: string }, w?: number) => {
    let r: ReturnType<typeof instance.actions.perform> | undefined
    act(() => {
      r = instance.actions.perform(
        "@matomezu/paper:item-place",
        { page: page().id, item: "ex5:tiles", at: { x: 40, y: 40 }, w, props },
        on,
      )
    })
    return r!
  }
  return { instance, on, page, place }
}

test("タイルを置き、札を足すと中身の欄 tiles に入る", () => {
  const { instance, on, page, place } = shelf()
  const item = (place({}) as { result: { item: string } }).result.item
  act(() => {
    for (const color of ["#ff0000", "#00ff00"])
      expect(instance.actions.perform("ex5:tile-add", { page: page().id, item, color }, on)).toMatchObject({ ok: true })
  })
  expect(page().items![0]!.tiles).toHaveLength(2)
})

test("B3: ビューの content に、中身の欄 tiles の札が来る（children でなくても）", () => {
  const { instance, on, page, place } = shelf()
  const item = (place({}) as { result: { item: string } }).result.item
  act(() => {
    instance.actions.perform("ex5:tile-add", { page: page().id, item, color: "#ff0000" }, on)
  })
  expect(document.querySelector("[data-ex5-tiles]")?.getAttribute("data-ex5-tiles")).toBe("1")
  // 形のビューには、ステージの今の倍率も渡る（監査 B7）
  expect(document.querySelector("[data-ex5-tiles]")?.getAttribute("data-ex5-zoom")).toBe("1")
})

test("B1: 自分の意味の theme の欄（札の色合い）を持つ形を置ける", () => {
  const { place } = shelf()
  expect(place({ theme: "cool" })).toMatchObject({ ok: true })
})

test("B2: 文字を持たない形は、caption の欄を変えても幅が変わらない", () => {
  const { instance, on, page, place } = shelf()
  const item = (place({ caption: "a" }, 100) as { result: { item: string } }).result.item
  act(() => {
    expect(
      instance.actions.perform(
        "@matomezu/paper:item-update",
        { page: page().id, item, props: { caption: "とても長い札の並びの名前" } },
        on,
      ),
    ).toMatchObject({ ok: true })
  })
  expect(page().items![0]!.w).toBe(100)
})

test("B3: 次に置くアイテムの id は、中身の欄 tiles の札の id とも重ならない", () => {
  const { instance, on, page, place } = shelf()
  const item = (place({}) as { result: { item: string } }).result.item
  let tile = ""
  act(() => {
    const r = instance.actions.perform("ex5:tile-add", { page: page().id, item, color: "#ff0000" }, on)
    tile = (r as { result: { tile: string } }).result.tile
  })
  const book = instance.state.getState().books[on.book] as unknown as PagedBook
  const ids = new Set<string>()
  for (let k = 0; k < 20; k++) ids.add(nextItemId(book, () => tile))
  expect(ids.has(tile)).toBe(false)
})
