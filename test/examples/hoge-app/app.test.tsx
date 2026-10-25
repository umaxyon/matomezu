import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { HogeApp, makeInstance } from "./App"

afterEach(cleanup)

test("自分のウィジェットを配置でステージに置き、そこから自分のコマンドを型のまま呼べる", () => {
  const instance = makeInstance()
  render(<HogeApp instance={instance} />)
  fireEvent.click(screen.getByRole("button", { name: "hoge を開く" }))
  expect(instance.state.getState().workspace.stages).toHaveLength(2)
  expect(screen.getByRole("dialog", { name: "hoge" }).textContent).toContain("こんにちは、MATOMEZU")
  // 分割したので、hoge のボタンはステージごとにある
  expect(screen.getAllByRole("button", { name: "hoge の言語" })).toHaveLength(2)
  fireEvent.click(screen.getAllByRole("button", { name: "hoge の言語" })[0]!)
  expect(instance.state.getState().settings.lang).toBe("en")
  // 自分の文言も、言語に合わせて出る
  expect(screen.getByRole("dialog", { name: "hoge" }).textContent).toContain("hello, MATOMEZU")
})

test("ビルトインプラグインのダイアログを、自分のものに差し替えられる", () => {
  const instance = makeInstance()
  render(<HogeApp instance={instance} />)
  act(() => instance.actions.openDialog("s1", "book.new"))
  expect(screen.getByRole("dialog", { name: "新しいブックの代わり" })).toBeTruthy()
})

test("追加のタイプのブックを作り、追加の形とビルトインの箱を置いて線でつなぎ、追加の設定を変え、ビルトインの紙の見せ方で描ける", () => {
  const instance = makeInstance()
  render(<HogeApp instance={instance} />)
  act(() => {
    expect(instance.actions.createBook("s1", { title: "フロー", type: "hoge-flow/flow" })).toBe(true)
  })
  const id = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  const on = { book: id }
  act(() => {
    expect(instance.actions.addPage("s1", { title: "p1" })).toBe(true)
  })
  const page = () =>
    (instance.state.getState().books[id] as { pages: { id: string; items?: { id: string }[] }[] }).pages[0]!
  const placed = (item: string, x: number, props: Record<string, unknown>) => {
    let r: ReturnType<typeof instance.actions.perform> | undefined
    act(() => {
      r = instance.actions.perform("item.place", { page: page().id, item, at: { x, y: 40 }, props }, on)
    })
    expect(r).toMatchObject({ ok: true })
    return (r as { result: { item: string } }).result.item
  }
  const d = placed("hoge-flow/diamond", 40, { caption: "判断" })
  const b = placed("shape.box", 300, { caption: "処理" })
  act(() => {
    expect(instance.actions.perform("line.connect", { page: page().id, from: d, to: b }, on)).toMatchObject({
      ok: true,
    })
    expect(instance.actions.perform("book.update", { settings: { hogeDirection: "right" } }, on)).toMatchObject({
      ok: true,
    })
  })
  expect(instance.state.getState().books[id]).toMatchObject({ type: "hoge-flow/flow", hogeDirection: "right" })
  expect(page().items).toHaveLength(3)
  expect(document.querySelector("[data-hoge-diamond]")?.textContent).toBe("判断")
})

test("追加の形は、選んでいないビルトインのタイプ（図面）のブックには置けない", () => {
  const instance = makeInstance()
  instance.actions.createBook("s1", { title: "図面", type: "drawing" })
  const id = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  instance.actions.addPage("s1", { title: "p1" })
  const page = (instance.state.getState().books[id] as { pages: { id: string }[] }).pages[0]!
  const r = instance.actions.perform(
    "item.place",
    { page: page.id, item: "hoge-flow/diamond", at: { x: 40, y: 40 }, props: { caption: "x" } },
    { book: id },
  )
  expect(r).toMatchObject({ ok: false })
})

// 作り手の違う追加プラグインを 2 つ以上いっしょに渡しても、それぞれのタイプ・形・設定・テーマが働き、互いの形は選ばれた所にだけ置ける
const newBook = (instance: ReturnType<typeof makeInstance>, type: "hoge-flow/flow" | "fuga/board") => {
  act(() => {
    expect(instance.actions.createBook("s1", { title: type, type })).toBe(true)
    expect(instance.actions.addPage("s1", { title: "p1" })).toBe(true)
  })
  const id = (instance.state.getState().workspace.stages[0]!.opened as { book: string }).book
  const page = (instance.state.getState().books[id] as { pages: { id: string }[] }).pages[0]!.id
  const place = (item: string, props: Record<string, unknown>) => {
    let r: ReturnType<typeof instance.actions.perform> | undefined
    act(() => {
      r = instance.actions.perform("item.place", { page, item, at: { x: 40, y: 40 }, props }, { book: id })
    })
    return r as { ok: boolean; result?: { item: string } }
  }
  return { id, page, place }
}

test("fuga のボードに fuga の星と中のリストを置いて線でつなぎ、fuga の設定を変えられる。既定のテーマは fuga のミント", () => {
  const instance = makeInstance()
  render(<HogeApp instance={instance} />)
  const { id, page, place } = newBook(instance, "fuga/board")
  const star = place("fuga/star", { caption: "星", points: 6 })
  const list = place("shape.list", { caption: "一覧" })
  expect(star).toMatchObject({ ok: true })
  expect(list).toMatchObject({ ok: true })
  act(() => {
    const on = { book: id }
    expect(
      instance.actions.perform("line.connect", { page, from: star.result!.item, to: list.result!.item }, on),
    ).toMatchObject({ ok: true })
    expect(instance.actions.perform("book.update", { settings: { fugaGrid: true } }, on)).toMatchObject({ ok: true })
  })
  expect(instance.state.getState().books[id]).toMatchObject({ type: "fuga/board", fugaGrid: true })
  expect(instance.catalog.core.bookTypes.get("fuga/board")?.theme).toBe("fuga/mint")
  expect(document.querySelector("[data-fuga-star]")?.getAttribute("data-fuga-star")).toBe("6")
})

test("追加の形は、それを選んだタイプのブックにだけ置ける（hoge のひし形は fuga のボードに、fuga の星は hoge のフローに置けない）", () => {
  const instance = makeInstance()
  expect(newBook(instance, "fuga/board").place("hoge-flow/diamond", { caption: "x" })).toMatchObject({ ok: false })
  expect(newBook(instance, "hoge-flow/flow").place("fuga/star", { caption: "x" })).toMatchObject({ ok: false })
})

test("fuga のテーマは、id で選べばほかの作り手のタイプのブックにも使える。両方の作り手のウィジェットが同じ配置に並ぶ", () => {
  const instance = makeInstance()
  render(<HogeApp instance={instance} />)
  const { id } = newBook(instance, "hoge-flow/flow")
  expect(screen.getAllByRole("button", { name: "hoge の言語" })).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: "fuga のミントにする" }))
  expect(instance.state.getState().books[id]).toMatchObject({ type: "hoge-flow/flow", theme: "fuga/mint" })
})
