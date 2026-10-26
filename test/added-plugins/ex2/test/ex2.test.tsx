import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, MatomezuProvider, placeAdded, Screen } from "matomezu/testing"
import EX2_UI from "../ui"

afterEach(cleanup)

const make = () => {
  const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX2_UI], home: "@matomezu/master:master", lang: "ja" })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <Screen />
    </MatomezuProvider>,
  )
  return instance
}

// フローのブックを作って開き、ページを 1 つ足す
const flow = (instance: ReturnType<typeof make>) => {
  act(() => {
    expect(instance.actions.createBook("s1", { title: "フロー", type: "ex2:flow" })).toBe(true)
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(instance.actions.addPage("s1", { title: "p1" })).toBe(true)
  })
  const page = () =>
    (
      instance.state.getState().books[book] as unknown as {
        pages: { id: string; items?: { id: string; props?: object }[] }[]
      }
    ).pages[0]!
  return { on: { book }, page }
}

test("フローのブックに判断のひし形とビルトインの箱を置いて線でつなぎ、追加の設定を変え、ビルトインの紙の見せ方で描く", () => {
  const instance = make()
  const { on, page } = flow(instance)
  const place = (item: "ex2:diamond" | "@matomezu/box:shape-box", x: number, caption: string) => {
    let r: ReturnType<typeof instance.actions.perform> | undefined
    act(() => {
      r = instance.actions.perform(
        "@matomezu/paper:item-place",
        { page: page().id, item, at: { x, y: 40 }, props: { caption } },
        on,
      )
    })
    expect(r).toMatchObject({ ok: true })
    return (r as { result: { item: string } }).result.item
  }
  const d = place("ex2:diamond", 40, "判断")
  const b = place("@matomezu/box:shape-box", 300, "処理")
  act(() => {
    expect(
      instance.actions.perform("@matomezu/line:line-connect", { page: page().id, from: d, to: b }, on),
    ).toMatchObject({
      ok: true,
    })
    expect(
      instance.actions.perform("@matomezu/base:book-update", { settings: { "ex2:flow-direction": "right" } }, on),
    ).toMatchObject({
      ok: true,
    })
  })
  expect(instance.state.getState().books[on.book]).toMatchObject({
    type: "ex2:flow",
    settings: { "ex2:flow-direction": "right" },
  })
  expect(page().items).toHaveLength(3)
  expect(document.querySelector("[data-ex2-diamond]")?.textContent).toBe("判断")
})

test("自分のアクションで判断に答える。判断のひし形でないアイテムには断る", () => {
  const instance = make()
  const { on, page } = flow(instance)
  act(() => {
    instance.actions.perform(
      "@matomezu/paper:item-place",
      { page: page().id, item: "ex2:diamond", at: { x: 40, y: 40 } },
      on,
    )
    instance.actions.perform(
      "@matomezu/paper:item-place",
      { page: page().id, item: "@matomezu/box:shape-box", at: { x: 300, y: 40 } },
      on,
    )
  })
  const [d, b] = page().items!.map(i => i.id)
  act(() => {
    expect(instance.actions.perform("ex2:diamond-answer", { page: page().id, item: d!, answer: "yes" }, on)).toEqual({
      ok: true,
      result: {},
    })
  })
  expect(page().items![0]!.props).toMatchObject({ answer: "yes" })
  expect(document.querySelector("[data-ex2-diamond]")?.getAttribute("data-ex2-diamond")).toBe("yes")
  expect(instance.actions.perform("ex2:diamond-answer", { page: page().id, item: b!, answer: "no" }, on)).toEqual({
    ok: false,
    reason: "refused",
  })
})

test("追加のダイアログで置き、編集のダイアログで答える（ダイアログは usePerform でアクションを行い、useItem で今の答えを読む）", () => {
  const instance = make()
  const { page } = flow(instance)
  act(() => instance.actions.openDialog("s1", "ex2:diamond-add", { page: page().id, at: { x: 40, y: 40 } }))
  const add = screen.getByRole("dialog", { name: "判断の追加" })
  fireEvent.change(add.querySelector("input")!, { target: { value: "続ける？" } })
  fireEvent.click(screen.getByRole("button", { name: "追加" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  const item = page().items![0]!
  expect(item.props).toMatchObject({ caption: "続ける？" })
  act(() => instance.actions.openDialog("s1", "ex2:diamond-edit", { page: page().id, item: item.id }))
  expect(screen.getByRole("button", { name: "いいえ" }).getAttribute("aria-pressed")).toBe("false")
  fireEvent.click(screen.getByRole("button", { name: "いいえ" }))
  expect(page().items![0]!.props).toMatchObject({ answer: "no" })
  expect(screen.queryByRole("dialog")).toBeNull()
  // 開き直すと、今の答えのボタンが押された見た目
  act(() => instance.actions.openDialog("s1", "ex2:diamond-edit", { page: page().id, item: item.id }))
  expect(screen.getByRole("button", { name: "いいえ" }).getAttribute("aria-pressed")).toBe("true")
  expect(screen.getByRole("button", { name: "はい" }).getAttribute("aria-pressed")).toBe("false")
})

test("判断のひし形は、選んでいないビルトインのタイプ（図面）のブックには置けない", () => {
  const instance = make()
  act(() => {
    instance.actions.createBook("s1", { title: "図面", type: "@matomezu/drawing:drawing" })
  })
  const book = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    instance.actions.addPage("s1", { title: "p1" })
  })
  const page = (instance.state.getState().books[book] as { pages: { id: string }[] }).pages[0]!
  const r = instance.actions.perform(
    "@matomezu/paper:item-place",
    { page: page.id, item: "ex2:diamond", at: { x: 0, y: 0 } },
    { book },
  )
  expect(r).toEqual({ ok: false, reason: "refused" })
})
