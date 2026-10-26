// ex4（2 つ目のつなぐもの）で、監査 E1〜E5 を確かめる（B5 は type-checks.ts）。
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, Screen } from "matomezu/testing"
import EX4_UI from "../ui"

afterEach(cleanup)

const make = () => {
  const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX4_UI], home: "@matomezu/master:master", lang: "ja" })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <Screen />
    </MatomezuProvider>,
  )
  return instance
}

interface Page {
  id: string
  items?: { id: string; item: string; from?: string; to?: string }[]
}

// 関係図を作って開き、箱を 3 つ置く（a と b を関係線で、b と c をビルトインの線で結ぶ）
const map = () => {
  const instance = make()
  act(() => {
    expect(instance.actions.createBook("s1", { title: "関係図", type: "ex4:map" })).toBe(true)
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(instance.actions.addPage("s1", { title: "p1" })).toBe(true)
  })
  const on = { book }
  const page = () => (instance.state.getState().books[book] as unknown as { pages: Page[] }).pages[0]!
  const box = (x: number) => {
    let r: ReturnType<typeof instance.actions.perform> | undefined
    act(() => {
      r = instance.actions.perform(
        "@matomezu/paper:item-place",
        { page: page().id, item: "@matomezu/box:shape-box", at: { x, y: 40 }, props: { caption: `箱${x}` } },
        on,
      )
    })
    return (r as { result: { item: string } }).result.item
  }
  const [a, b, c] = [box(40), box(300), box(560)]
  act(() => {
    expect(instance.actions.perform("ex4:relate", { page: page().id, from: a, to: b }, on)).toMatchObject({ ok: true })
    expect(
      instance.actions.perform("@matomezu/line:line-connect", { page: page().id, from: b, to: c }, on),
    ).toMatchObject({ ok: true })
  })
  const el = (id: string) => document.querySelector(`[data-item="${id}"]`)!
  return { instance, on, page, a, b, c, el }
}

test("関係線とビルトインの線を同じページに引き、どちらも描く", () => {
  const { page, a } = map()
  expect(page().items!.map(i => i.item)).toEqual([
    "@matomezu/box:shape-box",
    "@matomezu/box:shape-box",
    "@matomezu/box:shape-box",
    "ex4:relation",
    "@matomezu/line:connector-line",
  ])
  expect(document.querySelectorAll("[data-ex4-relation]")).toHaveLength(1)
  // E2: 形にはどちらのつなぐものの〇も重ねる（関係線の〇はいつも出す）
  expect(document.querySelector(`[data-ex4-port="${a}"]`)).not.toBeNull()
})

test("E1: 関係線の層が薄くするよう求めた形は薄くなる（外側のつなぐものの ShapeMarks も効く）", () => {
  const { a, c, el } = map()
  fireEvent.pointerEnter(el(a))
  expect(el(a).querySelector("[data-port]")).not.toBeNull() // 乗せたことは線の〇で分かる
  // a に乗せると、関係線は a と b のほかを薄くするよう求める。内側のビルトインの線の層が何も求めないので、c は薄くならない
  expect(el(c).getAttribute("data-look")).toBe("faded")
})

test("E4: 端の形を消すと、端の無くなった関係線も消える（つなぐものが tidy を書かなくても）", () => {
  const { instance, on, page, a } = map()
  act(() => {
    expect(instance.actions.perform("@matomezu/paper:item-remove", { page: page().id, items: [a] }, on)).toMatchObject({
      ok: true,
    })
  })
  expect(page().items!.filter(i => i.item === "ex4:relation")).toEqual([])
})

test("E5: ビルトインの線（と線を選ぶ図面）を外しても、既定の配置で組める", () => {
  const plugins = BUILTIN_UI.filter(ui => ui.id !== "@matomezu/line" && ui.id !== "@matomezu/drawing")
  const instance = createMatomezu({ plugins, home: "@matomezu/master:master", partial: true })
  expect(() =>
    render(
      <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
        <Screen />
      </MatomezuProvider>,
    ),
  ).not.toThrow()
})
