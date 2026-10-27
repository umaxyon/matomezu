// ex5（文字を持たず、中身のフィールドが children でない形）で、監査 B1〜B3 を確かめる（themeProp の型は type-checks.ts）
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { addPageIn, createBookIn, nextItemId, type PagedBook } from "matomezu"
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
    expect(createBookIn(instance, "s1", { title: "棚", type: "ex5:shelf" })).toBe(true)
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(addPageIn(instance, "s1", { title: "p1" })).toBe(true)
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

test("タイルを置き、札を足すと中身のフィールド tiles に入る", () => {
  const { instance, on, page, place } = shelf()
  const item = (place({}) as { result: { item: string } }).result.item
  act(() => {
    for (const color of ["#ff0000", "#00ff00"])
      expect(instance.actions.perform("ex5:tile-add", { page: page().id, item, color }, on)).toMatchObject({ ok: true })
  })
  expect(page().items![0]!.tiles).toHaveLength(2)
  // プラグインが持つテーマキーも、タイルの要素で --tiles-fill として読める
  expect(document.querySelector<HTMLElement>("[data-item]")?.style.getPropertyValue("--tiles-fill")).not.toBe("")
})

test("B3: ビューの content に、中身のフィールド tiles の札が来る（children でなくても）", () => {
  const { instance, on, page, place } = shelf()
  const item = (place({}) as { result: { item: string } }).result.item
  act(() => {
    instance.actions.perform("ex5:tile-add", { page: page().id, item, color: "#ff0000" }, on)
  })
  expect(document.querySelector("[data-ex5-tiles]")?.getAttribute("data-ex5-tiles")).toBe("1")
  // 形のビューには、ステージの今の倍率も渡る（監査 B7）
  expect(document.querySelector("[data-ex5-tiles]")?.getAttribute("data-ex5-zoom")).toBe("1")
})

test("B1: 自分の意味の theme の項目（札の色合い）を持つ形を置ける", () => {
  const { place } = shelf()
  expect(place({ theme: "cool" })).toMatchObject({ ok: true })
})

test("B2: 文字を持たない形は、caption の項目を変えても幅が変わらない", () => {
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

test("B3: 次に置くアイテムの id は、中身のフィールド tiles の札の id とも重ならない", () => {
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

test("自分の道具の組: 棚の図の道具は、選択・仕分け・ハンドの順に回り、道具の切り替えのボタンに仕分けの道具の名前とアイコンが出る", () => {
  const { instance } = shelf()
  const tools = [1, 2, 3].map(() => {
    act(() => {
      instance.actions.command("s1", "@matomezu/base:tool-next")
    })
    return document.querySelector("[data-stage='s1']")?.getAttribute("data-tool")
  })
  expect(tools).toEqual(["ex5:sort", "@matomezu/base:hand", "@matomezu/base:select"])
  act(() => {
    instance.actions.command("s1", "@matomezu/base:tool-next")
  })
  expect(document.querySelector("button[aria-label='仕分けツール'] svg")).not.toBeNull()
})
