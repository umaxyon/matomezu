// 形（@matomezu/shape）をフローチャートのページで: ツールボックスに形が並ぶ・形を置いて描く・追加と編集のダイアログ・形のつなぎ口・分岐から出る線のキャプションの候補・台形の向き・キャプションで広がる向き

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { shapesOf } from "../../../../web/src/core/placed"
import { screenOf } from "../../../../web/src/core/window"
import { portAreasOf, rectsOf } from "../../../../web/src/plugins/base"
import { floorsOf } from "../../../../web/src/plugins/base/place/size"
import { linesOf } from "../../../../web/src/plugins/items/line/placed"
import { SHAPE_RULES, SLANT, TURNED_SLANT } from "../../../../web/src/plugins/items/shape/outline"
import { SHAPES } from "../../../../web/src/plugins/items/shape/shapes"
import { placedWidth } from "../../../../web/src/plugins/items/shape/size"
import { flowchart } from "../../page-types/flowchart/support"

afterEach(cleanup)

test("フローチャートのツールボックス（下の行のフッタメニュー）には箱と「形」のボタンが並び、「形」で開くパネルに 8 つの形と 15 のシェイプが並ぶ。形を押すとパネルを閉じてその形を置こうとする", () => {
  const { store } = flowchart()
  expect(screen.getByRole("button", { name: "箱", hidden: true })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "角丸", hidden: true })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "形", hidden: true }))
  const panel = screen.getByRole("group", { name: "形", hidden: true })
  const shapes = ["角丸", "ひし形", "平行四辺形", "平行四辺形（逆）", "台形", "台形（逆）", "六角形", "円"]
  const pictures = [
    "スティックマン",
    "DB",
    "サーバー",
    "パソコン",
    "工場",
    "書類",
    "ゴミ箱",
    "ロボット",
    "猫",
    "ハート",
    "電球",
    "犬",
    "森",
    "家",
    "家族",
  ]
  const names = [...shapes, ...pictures]
  expect(
    within(panel)
      .getAllByRole("button", { hidden: true })
      .map(b => b.getAttribute("aria-label")),
  ).toEqual(names)
  fireEvent.click(within(panel).getByRole("button", { name: "ひし形", hidden: true }))
  expect(screen.queryByRole("group", { name: "形", hidden: true })).toBeNull()
  expect(screenOf(store.state.getState().window).stages[0]!.placing?.item).toBe("@matomezu/shape:shape-diamond")
  expect(screen.getByRole("button", { name: "形", hidden: true }).getAttribute("aria-pressed")).toBe("true")
})

test("8 つの形を置け、形ごとの輪郭で描く。置いたときの幅はキャプションが見える幅（一番狭くて形の大きさ）", () => {
  const { store, page } = flowchart()
  act(() => {
    SHAPES.forEach((s, i) => {
      const at = { x: 20, y: 20 + i * 90 }
      const props = { caption: i === 0 ? "" : "開始" }
      expect(
        store.actions.perform("@matomezu/paper:item-place", { item: s.item.id, at, props }, { page: page().id }).ok,
      ).toBe(true)
    })
  })
  expect(shapesOf(page()).map(i => i.item)).toEqual(SHAPES.map(s => s.item.id))
  for (const s of SHAPES) expect(document.querySelector(`[data-shape-kind="${s.kind}"]`)).not.toBeNull()
  expect(placedWidth("rounded", "")).toBe(SHAPE_RULES.rounded.size.w)
  // ひし形は中に収まる幅が半分なので、同じキャプションでも角丸より広い
  expect(placedWidth("diamond", "判断する")).toBeGreaterThan(placedWidth("rounded", "判断する"))
})

test("形の追加のダイアログは、置き方が断りの文を返せば閉じずにその文を出す", () => {
  const { store, page } = flowchart()
  const tried: object[] = []
  const place = (props: object) => {
    tried.push(props)
    return "@matomezu/paper:No free spot" as never
  }
  act(() => store.actions.openDialog("s1", "@matomezu/shape:hexagon-add", { page: page().id, place }))
  const add = screen.getByRole("dialog", { name: "形の追加" })
  fireEvent.change(within(add).getByLabelText("キャプション", { exact: true }), { target: { value: "準備" } })
  fireEvent.click(screen.getByRole("button", { name: "追加" }))
  expect(tried).toEqual([expect.objectContaining({ caption: "準備" })])
  expect(screen.getByRole("dialog", { name: "形の追加" })).toBeTruthy()
  expect(within(add).getByText("空きがありません")).toBeTruthy()
})

test("形の追加のダイアログでキャプションを決めて置き、編集のダイアログで変える", () => {
  const { store, page } = flowchart()
  // 置き方は開いた側（紙）が渡す。ここでは渡された項目の値でそのまま置く
  const place = (props: object) => {
    const done = store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/shape:shape-hexagon", at: { x: 40, y: 40 }, props } as never,
      { page: page().id },
    )
    return done.ok ? null : ("Does not fit on the paper" as never)
  }
  act(() => store.actions.openDialog("s1", "@matomezu/shape:hexagon-add", { page: page().id, place }))
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

test("形は辺の真ん中（頂点）だけに線をつなぎ、平行四辺形と台形は食い込みの半分だけ内側につなぐ。箱はふち全体", () => {
  const { store, page } = flowchart()
  const place = (item: string, x: number) =>
    store.actions.perform("@matomezu/paper:item-place", { item, at: { x, y: 40 } }, { page: page().id })
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
  const { store, page } = flowchart()
  act(() => {
    for (const [item, x] of [
      ["@matomezu/shape:shape-diamond", 40],
      ["@matomezu/box:shape-box", 300],
      ["@matomezu/box:shape-box", 560],
    ] as const)
      store.actions.perform("@matomezu/paper:item-place", { item, at: { x, y: 40 } }, { page: page().id })
  })
  const [diamond, box, other] = shapesOf(page())
  const connect = (from: string, to: string) =>
    expect(store.actions.perform("@matomezu/line:line-connect", { from, to }, { page: page().id }).ok).toBe(true)
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

test("形は個別のテーマを持たない: 追加と編集のダイアログにテーマの入力Formは無く、テーマを書いて置くと断る", () => {
  const { store, page } = flowchart()
  act(() => store.actions.openDialog("s1", "@matomezu/shape:diamond-add", { page: page().id, place: () => null }))
  const add = screen.getByRole("dialog", { name: "形の追加" })
  expect(within(add).queryByLabelText("テーマ")).toBeNull()
  fireEvent.click(within(add).getByRole("button", { name: "キャンセル" }))
  const placed = store.actions.perform(
    "@matomezu/paper:item-place",
    { item: "@matomezu/shape:shape-diamond", at: { x: 40, y: 40 }, props: { theme: "@matomezu/base:sticky" } },
    { page: page().id },
  )
  expect(placed.ok).toBe(false)
})

test("キャプションで形が広がるとき、流れが下へなら横の真ん中を保ち、右へなら左を保つ", () => {
  const { store, on, page } = flowchart()
  act(() => {
    store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/shape:shape-rounded", at: { x: 300, y: 40 }, props: { caption: "a" } },
      { page: page().id },
    )
  })
  const id = shapesOf(page())[0]!.id
  const rect = () => rectsOf(store.catalog.core, page()).get(id)!
  const center = rect().x + rect().w / 2
  const widen = (caption: string) =>
    act(() => {
      expect(
        store.actions.perform("@matomezu/paper:item-update", { item: id, props: { caption } }, { page: page().id }).ok,
      ).toBe(true)
    })
  widen("とても長いキャプションです")
  expect(rect().w).toBeGreaterThan(96)
  expect(Math.abs(rect().x + rect().w / 2 - center)).toBeLessThanOrEqual(1)
  act(() => {
    store.actions.perform(
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
  })
  const left = rect().x
  widen("もっともっと長いキャプションにします")
  expect(rect().x).toBe(left)
})

test("台形は向きを持つ: 横向きなら反時計回りに 90 度回して描き（文字も縦）、線は上下の辺の真ん中（食い込みの半分だけ内側）につなぐ。流れの向きを変えても、置いた台形の向きは変えない", () => {
  const { store, on, page } = flowchart()
  act(() => {
    store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/shape:shape-trapezoid", at: { x: 40, y: 40 } },
      { page: page().id },
    )
    store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/shape:shape-trapezoid", at: { x: 300, y: 40 }, props: { turned: true } },
      { page: page().id },
    )
  })
  const [upright, sideways] = shapesOf(page())
  const drawn = () => [...document.querySelectorAll('[data-shape-kind="trapezoid"]')] as HTMLElement[]
  const areas = () => portAreasOf(store.catalog.core, page())
  const rects = () => rectsOf(store.catalog.core, page())
  expect(drawn().map(d => d.dataset.turned === "true")).toEqual([false, true])
  // 横向きは縦長（置いたときの大きさの縦と横を入れ替える）
  expect(rects().get(sideways!.id)!.h).toBeGreaterThan(rects().get(sideways!.id)!.w)
  expect(areas().get(upright!.id)).toMatchObject({ x: upright!.x + SLANT / 2, y: upright!.y })
  expect(areas().get(sideways!.id)).toMatchObject({ x: sideways!.x, y: sideways!.y + TURNED_SLANT / 2 })
  act(() => {
    store.actions.perform(
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
  })
  expect(drawn().map(d => d.dataset.turned === "true")).toEqual([false, true])
})

test("台形の編集のダイアログで向きを切り替えると、幅と高さを入れ替える。追加のダイアログは、流れが右へのブックでは横向きから始まる", () => {
  const { store, on, page } = flowchart()
  act(() => {
    store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/shape:shape-trapezoid", at: { x: 40, y: 40 } },
      { page: page().id },
    )
  })
  const t = shapesOf(page())[0]!
  const size = () => rectsOf(store.catalog.core, page()).get(t.id)!
  const { w, h } = size()
  act(() => store.actions.openDialog("s1", "@matomezu/shape:shape-edit", { page: page().id, item: t.id }))
  const edit = screen.getByRole("dialog", { name: "形の編集" })
  expect(within(edit).getByText("90 度回転")).toBeTruthy()
  fireEvent.click(within(edit).getByRole("switch", { name: "90 度回転" }))
  fireEvent.click(within(edit).getByRole("button", { name: "確定" }))
  expect(size()).toMatchObject({ w: h, h: w })
  act(() => {
    store.actions.perform(
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
  })
  act(() => store.actions.openDialog("s1", "@matomezu/shape:trapezoid-add", { page: page().id, place: () => null }))
  const add = screen.getByRole("dialog", { name: "形の追加" })
  expect(within(add).getByRole("switch", { name: "90 度回転" }).getAttribute("aria-checked")).toBe("true")
})

test("90 度回転した台形は、キャプションが伸びたら縦に広がる（流れが右へなら上下の真ん中を保つ）。押されて縮むときも、キャプションが見える高さより低くしない", () => {
  const { store, on, page } = flowchart()
  act(() => {
    store.actions.perform(
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
    store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/shape:shape-trapezoid", at: { x: 300, y: 300 }, props: { caption: "a", turned: true } },
      { page: page().id },
    )
  })
  const t = shapesOf(page())[0]!
  const rect = () => rectsOf(store.catalog.core, page()).get(t.id)!
  const before = rect()
  act(() => {
    store.actions.perform(
      "@matomezu/paper:item-update",
      { item: t.id, props: { caption: "とても長いキャプションです" } },
      { page: page().id },
    )
  })
  expect(rect().h).toBeGreaterThan(before.h)
  expect(rect().w).toBe(before.w)
  expect(Math.abs(rect().y + rect().h / 2 - (before.y + before.h / 2))).toBeLessThanOrEqual(1)
  expect(floorsOf(store.catalog.core, page()).get(t.id)!.h).toBe(rect().h)
})
