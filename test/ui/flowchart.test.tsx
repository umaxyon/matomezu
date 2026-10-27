// フローチャートのブック（@matomezu/flowchart）と形（@matomezu/shape）: 作る・道具箱に形が並ぶ・形を置いて描く・追加と編集のダイアログ・流れの向き・形のつなぎ口・分岐から出る線のキャプションの候補
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { portAreasOf, shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { addPageIn, createBookIn } from "../../web/src/plugins/base"
import { linesOf } from "../../web/src/plugins/items/line/placed"
import { SHAPE_RULES, SLANT } from "../../web/src/plugins/items/shape/outline"
import { SHAPES } from "../../web/src/plugins/items/shape/shapes"
import { placedWidth } from "../../web/src/plugins/items/shape/size"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

// フローチャートのブックを作り、ページを 1 つ足して開く
function flowchart() {
  const store = createMatomezu({ home: "@matomezu/master:master", lang: "ja", plugins: BUILTIN_UI })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  act(() => {
    expect(createBookIn(store, "s1", { title: "流れ", type: "@matomezu/flowchart:flowchart" })).toBe(true)
  })
  const id = (store.state.getState().workspace.stages[0]!.opened as { book: string }).book
  act(() => {
    expect(addPageIn(store, "s1", { title: "p1" })).toBe(true)
  })
  const book = () => store.state.getState().books[id] as BookOf<"@matomezu/flowchart:flowchart">
  const page = () => book().pages[0]!
  return { store, on: { book: id }, book, page }
}

test("フローチャートの道具箱には、形・箱・線が並ぶ", () => {
  flowchart()
  for (const name of ["角丸", "箱", "ひし形", "平行四辺形", "平行四辺形（逆）", "台形", "台形（逆）", "六角形", "円"])
    expect(screen.getByRole("button", { name })).toBeTruthy()
})

test("8 つの形を置け、形ごとの輪郭で描く。置いたときの幅はキャプションが見える幅（一番狭くて形の大きさ）", () => {
  const { store, on, page } = flowchart()
  act(() => {
    SHAPES.forEach((s, i) => {
      const at = { x: 20, y: 20 + i * 90 }
      const props = { caption: i === 0 ? "" : "開始" }
      expect(
        store.actions.perform("@matomezu/paper:item-place", { page: page().id, item: s.item.id, at, props }, on).ok,
      ).toBe(true)
    })
  })
  expect(shapesOf(page()).map(i => i.item)).toEqual(SHAPES.map(s => s.item.id))
  for (const s of SHAPES) expect(document.querySelector(`[data-shape-kind="${s.kind}"]`)).not.toBeNull()
  expect(placedWidth("rounded", "")).toBe(SHAPE_RULES.rounded.size.w)
  // ひし形は中に収まる幅が半分なので、同じキャプションでも角丸より広い
  expect(placedWidth("diamond", "判断する")).toBeGreaterThan(placedWidth("rounded", "判断する"))
})

test("形の追加のダイアログでキャプションを決めて置き、編集のダイアログで変える", () => {
  const { store, page } = flowchart()
  act(() => store.actions.openDialog("s1", "@matomezu/shape:hexagon-add", { page: page().id, at: { x: 40, y: 40 } }))
  const add = screen.getByRole("dialog", { name: "形の追加" })
  fireEvent.change(within(add).getByLabelText("キャプション", { exact: true }), { target: { value: "準備" } })
  fireEvent.click(screen.getByRole("button", { name: "追加" }))
  const hexagon = shapesOf(page()).find(i => i.item === "@matomezu/shape:shape-hexagon")!
  expect(hexagon.props).toMatchObject({ caption: "準備" })
  act(() => store.actions.openDialog("s1", "@matomezu/shape:shape-edit", { page: page().id, item: hexagon.id }))
  const edit = screen.getByRole("dialog", { name: "形の編集" })
  fireEvent.change(within(edit).getByLabelText("キャプション", { exact: true }), { target: { value: "準備する" } })
  fireEvent.click(screen.getByRole("button", { name: "確定" }))
  expect(shapesOf(page()).find(i => i.id === hexagon.id)?.props).toMatchObject({ caption: "準備する" })
})

test("流れの向きはブックの設定で、既定は下へ。右へに変えられる", () => {
  const { store, on, book } = flowchart()
  act(() => {
    expect(
      store.actions.perform(
        "@matomezu/base:book-update",
        { settings: { "@matomezu/flowchart:flow-direction": "right" } },
        on,
      ).ok,
    ).toBe(true)
  })
  expect(book().settings).toMatchObject({ "@matomezu/flowchart:flow-direction": "right" })
})

test("形は辺の真ん中（頂点）だけに線をつなぎ、平行四辺形と台形は食い込みの半分だけ内側につなぐ。箱はふち全体", () => {
  const { store, on, page } = flowchart()
  const place = (item: string, x: number) =>
    store.actions.perform("@matomezu/paper:item-place", { page: page().id, item, at: { x, y: 40 } }, on)
  act(() => {
    place("@matomezu/shape:shape-diamond", 40)
    place("@matomezu/shape:shape-parallelogram", 240)
    place("@matomezu/box:shape-box", 440)
  })
  const [diamond, para, box] = shapesOf(page())
  const areas = portAreasOf(store.catalog.core, page())
  expect(areas.get(diamond!.id)).toMatchObject({ x: diamond!.x, midpoints: true })
  expect(areas.get(para!.id)).toMatchObject({ x: para!.x + SLANT / 2, midpoints: true })
  expect(areas.get(box!.id)).toMatchObject({ x: box!.x, midpoints: false })
})

test("ひし形から出る線の編集のダイアログに、キャプションの候補 Yes / No を出し、押すとキャプションに入る", () => {
  const { store, on, page } = flowchart()
  act(() => {
    for (const [item, x] of [
      ["@matomezu/shape:shape-diamond", 40],
      ["@matomezu/box:shape-box", 300],
      ["@matomezu/box:shape-box", 560],
    ] as const)
      store.actions.perform("@matomezu/paper:item-place", { page: page().id, item, at: { x, y: 40 } }, on)
  })
  const [diamond, box, other] = shapesOf(page())
  const connect = (from: string, to: string) =>
    expect(store.actions.perform("@matomezu/line:line-connect", { page: page().id, from, to }, on).ok).toBe(true)
  act(() => {
    connect(diamond!.id, box!.id)
    connect(other!.id, diamond!.id)
  })
  const [out, back] = linesOf(page())
  act(() => store.actions.openDialog("s1", "@matomezu/line:line-edit", { page: page().id, item: back!.id }))
  expect(screen.queryByRole("button", { name: "Yes" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }))
  act(() => store.actions.openDialog("s1", "@matomezu/line:line-edit", { page: page().id, item: out!.id }))
  const dialog = screen.getByRole("dialog", { name: "線の編集" })
  fireEvent.click(within(dialog).getByRole("button", { name: "No" }))
  expect((within(dialog).getByLabelText("キャプション") as HTMLInputElement).value).toBe("No")
})
