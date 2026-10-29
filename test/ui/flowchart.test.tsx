// フローチャートのブック（@matomezu/flowchart）と形（@matomezu/shape）: 作る・ツールボックスに形が並ぶ・形を置いて描く・追加と編集のダイアログ・流れの向き・形のつなぎ口・分岐から出る線のキャプションの候補・自動で整列
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { addPageIn, createBookIn, portAreasOf, rectsOf } from "../../web/src/plugins/base"
import { floorsOf } from "../../web/src/plugins/base/place/items"
import { ALIGN_MARGIN } from "../../web/src/plugins/books/flowchart/actions"
import { linesOf } from "../../web/src/plugins/items/line/placed"
import { SHAPE_RULES, SLANT, TURNED_SLANT } from "../../web/src/plugins/items/shape/outline"
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

test("フローチャートのツールボックス（下の行のドロワー）には箱と「形」のボタンが並び、「形」で開くパネルに 8 つの形と 15 のシェイプが並ぶ。形を押すとパネルを閉じてその形を置こうとする", () => {
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
  expect(store.state.getState().workspace.stages[0]!.placing).toBe("@matomezu/shape:shape-diamond")
  expect(screen.getByRole("button", { name: "形", hidden: true }).getAttribute("aria-pressed")).toBe("true")
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

// 開始 → 処理 → 分岐 → (Yes) 終了 / (No) 処理 2 の流れを置き、線でつなぐ（端は固定して引く）
function chart(f: ReturnType<typeof flowchart>) {
  const { store, on, page } = f
  const place = (item: string, x: number, y: number, caption: string) =>
    store.actions.perform("@matomezu/paper:item-place", { page: page().id, item, at: { x, y }, props: { caption } }, on)
  act(() => {
    place("@matomezu/shape:shape-rounded", 20, 20, "開始")
    place("@matomezu/box:shape-box", 300, 120, "処理")
    place("@matomezu/shape:shape-diamond", 20, 300, "分岐")
    place("@matomezu/shape:shape-rounded", 400, 500, "終了")
    place("@matomezu/box:shape-box", 20, 600, "処理 2")
  })
  const [start, work, branch, end, work2] = shapesOf(page()).map(s => s.id)
  const connect = (from: string, to: string) =>
    expect(
      store.actions.perform(
        "@matomezu/line:line-connect",
        { page: page().id, from, to, props: { exitAt: 0.3, enterAt: 0.7 } },
        on,
      ).ok,
    ).toBe(true)
  act(() => {
    connect(start!, work!)
    connect(work!, branch!)
    connect(branch!, end!)
    connect(branch!, work2!)
  })
  return { start: start!, work: work!, branch: branch!, end: end!, work2: work2! }
}

test("自動で整列: 本筋を紙の左右の真ん中の縦の線にそろえ、分岐の枝は右に置き、線の端の固定を外す", () => {
  const f = flowchart()
  const { store, on, page } = f
  const ids = chart(f)
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", { page: page().id }, on).ok).toBe(true)
  })
  const rects = rectsOf(store.catalog.core, page())
  const cx = (id: string) => rects.get(id)!.x + rects.get(id)!.w / 2
  const paper = 794 // A4 の縦の幅
  const main = [ids.start, ids.work, ids.branch, ids.end].map(cx)
  expect(new Set(main).size).toBe(1)
  expect(Math.abs(main[0]! - paper / 2)).toBeLessThan(paper / 4)
  expect(cx(ids.work2)).toBeGreaterThan(main[0]!)
  expect(rects.get(ids.start)!.y).toBe(ALIGN_MARGIN)
  for (const l of linesOf(page())) expect(l.props).not.toHaveProperty("exitAt")
})

test("流れの向きが右へのブックの自動で整列は、本筋を横にそろえ、分岐の枝は下に置く", () => {
  const f = flowchart()
  const { store, on, page } = f
  const ids = chart(f)
  act(() => {
    store.actions.perform(
      "@matomezu/base:book-update",
      { settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
  })
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", { page: page().id }, on).ok).toBe(true)
  })
  const rects = rectsOf(store.catalog.core, page())
  const cy = (id: string) => rects.get(id)!.y + rects.get(id)!.h / 2
  const main = [ids.start, ids.work, ids.branch, ids.end].map(cy)
  expect(new Set(main).size).toBe(1)
  expect(cy(ids.work2)).toBeGreaterThan(main[0]!)
  expect(rects.get(ids.start)!.x).toBe(ALIGN_MARGIN)
})

test("自動で整列は、紙に収まらなければ断って何も変えない", () => {
  const { store, on, page } = flowchart()
  // 縦に 20 段の流れは A4 の縦に収まらない
  act(() => {
    for (let i = 0; i < 20; i++)
      store.actions.perform(
        "@matomezu/paper:item-place",
        {
          page: page().id,
          item: "@matomezu/box:shape-box",
          at: { x: 20 + (i % 5) * 150, y: 20 + Math.floor(i / 5) * 200 },
        },
        on,
      )
  })
  const ids = shapesOf(page()).map(s => s.id)
  act(() => {
    for (let i = 1; i < ids.length; i++)
      store.actions.perform("@matomezu/line:line-connect", { page: page().id, from: ids[i - 1]!, to: ids[i]! }, on)
  })
  const before = page()
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", { page: page().id }, on).ok).toBe(false)
  })
  expect(page()).toBe(before)
})

test("紙の右クリックのメニューの「自動で整列」は、確認のダイアログを出し、実行で整える（図面のメニューに出ないことは screen.test.tsx）", () => {
  const f = flowchart()
  chart(f)
  const before = f.page()
  fireEvent.contextMenu(screen.getByRole("img", { name: "紙" }), { clientX: 300, clientY: 300 })
  fireEvent.click(screen.getByRole("menuitem", { name: "自動で整列" }))
  const dialog = screen.getByRole("dialog", { name: "自動で整列" })
  expect(within(dialog).getByText("レイアウトを自動で整えてもよいですか？")).toBeTruthy()
  // 向きの違う台形が無いので、台形の向きを合わせる切り替えは出さない
  expect(within(dialog).queryByRole("switch")).toBeNull()
  fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }))
  expect(f.page()).toBe(before)
  fireEvent.contextMenu(screen.getByRole("img", { name: "紙" }), { clientX: 300, clientY: 300 })
  fireEvent.click(screen.getByRole("menuitem", { name: "自動で整列" }))
  fireEvent.click(within(screen.getByRole("dialog", { name: "自動で整列" })).getByRole("button", { name: "実行" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  const rects = rectsOf(f.store.catalog.core, f.page())
  expect(new Set([...rects.values()].slice(0, 4).map(r => r.x + r.w / 2)).size).toBe(1)
})

test("確認のダイアログの実行が紙に収まらず断られたら、閉じずに理由を出す", () => {
  const { store, on, page } = flowchart()
  act(() => {
    for (let i = 0; i < 20; i++)
      store.actions.perform(
        "@matomezu/paper:item-place",
        {
          page: page().id,
          item: "@matomezu/box:shape-box",
          at: { x: 20 + (i % 5) * 150, y: 20 + Math.floor(i / 5) * 200 },
        },
        on,
      )
  })
  const ids = shapesOf(page()).map(s => s.id)
  act(() => {
    for (let i = 1; i < ids.length; i++)
      store.actions.perform("@matomezu/line:line-connect", { page: page().id, from: ids[i - 1]!, to: ids[i]! }, on)
  })
  act(() => store.actions.openDialog("s1", "@matomezu/flowchart:page-align", { page: page().id }))
  const dialog = screen.getByRole("dialog", { name: "自動で整列" })
  fireEvent.click(within(dialog).getByRole("button", { name: "実行" }))
  expect(within(dialog).getByText("紙に収まりません")).toBeTruthy()
})

test("トーストは画面の下に出て、押すと消える", () => {
  const { store } = flowchart()
  act(() => {
    store.actions.showToast({ kind: "warn", message: "@matomezu/flowchart:Does not fit on the paper" })
  })
  const toast = screen.getByRole("alert")
  expect(toast.textContent).toBe("紙に収まりません")
  expect(toast.dataset.kind).toBe("warn")
  fireEvent.click(toast)
  expect(screen.queryByRole("alert")).toBeNull()
})

// 開始の形と箱をつないだチャートを n 個置く（チャートどうしはつながない）
function charts(f: ReturnType<typeof flowchart>, n: number) {
  const { store, on, page } = f
  act(() => {
    for (let i = 0; i < n; i++) {
      for (const [item, y] of [
        ["@matomezu/shape:shape-rounded", 20],
        ["@matomezu/box:shape-box", 200],
      ] as const)
        store.actions.perform(
          "@matomezu/paper:item-place",
          { page: page().id, item, at: { x: 20 + i * 140, y: y + (i % 2) * 300 }, props: { caption: `c${i}` } },
          on,
        )
    }
  })
  const ids = shapesOf(page()).map(s => s.id)
  act(() => {
    for (let i = 0; i < n; i++)
      store.actions.perform(
        "@matomezu/line:line-connect",
        { page: page().id, from: ids[i * 2]!, to: ids[i * 2 + 1]! },
        on,
      )
  })
  return Array.from({ length: n }, (_, i) => [ids[i * 2]!, ids[i * 2 + 1]!] as const)
}

test("自動で整列: つながっていないチャートは、上をそろえて左右に並べ、紙の幅を超えるなら折り返して下の段に置く", () => {
  const f = flowchart()
  const { store, on, page } = f
  const list = charts(f, 6)
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", { page: page().id }, on).ok).toBe(true)
  })
  const rects = rectsOf(store.catalog.core, page())
  const starts = list.map(([s]) => rects.get(s)!)
  // 1 段目のチャートは上をそろえ、左から順に並ぶ
  expect(starts[1]!.y).toBe(starts[0]!.y)
  expect(starts[1]!.x).toBeGreaterThan(starts[0]!.x)
  // どこかで折り返し、下の段に置く
  const wrapped = starts.findIndex(r => r.y > starts[0]!.y)
  expect(wrapped).toBeGreaterThan(1)
  expect(starts[wrapped]!.x).toBeLessThan(starts[wrapped - 1]!.x)
  // 紙の外には出ない
  for (const r of rects.values()) expect(r.x + r.w).toBeLessThanOrEqual(794)
})

test("形は個別のテーマを持たない: 追加と編集のダイアログにテーマの入力Formは無く、テーマを書いて置くと断る", () => {
  const { store, on, page } = flowchart()
  act(() => store.actions.openDialog("s1", "@matomezu/shape:diamond-add", { page: page().id, at: { x: 40, y: 40 } }))
  const add = screen.getByRole("dialog", { name: "形の追加" })
  expect(within(add).queryByLabelText("テーマ")).toBeNull()
  fireEvent.click(within(add).getByRole("button", { name: "キャンセル" }))
  const placed = store.actions.perform(
    "@matomezu/paper:item-place",
    {
      page: page().id,
      item: "@matomezu/shape:shape-diamond",
      at: { x: 40, y: 40 },
      props: { theme: "@matomezu/base:sticky" },
    },
    on,
  )
  expect(placed.ok).toBe(false)
})

test("キャプションで形が広がるとき、流れが下へなら横の真ん中を保ち、右へなら左を保つ", () => {
  const { store, on, page } = flowchart()
  act(() => {
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page: page().id, item: "@matomezu/shape:shape-rounded", at: { x: 300, y: 40 }, props: { caption: "a" } },
      on,
    )
  })
  const id = shapesOf(page())[0]!.id
  const rect = () => rectsOf(store.catalog.core, page()).get(id)!
  const center = rect().x + rect().w / 2
  const widen = (caption: string) =>
    act(() => {
      expect(
        store.actions.perform("@matomezu/paper:item-update", { page: page().id, item: id, props: { caption } }, on).ok,
      ).toBe(true)
    })
  widen("とても長いキャプションです")
  expect(rect().w).toBeGreaterThan(96)
  expect(Math.abs(rect().x + rect().w / 2 - center)).toBeLessThanOrEqual(1)
  act(() => {
    store.actions.perform(
      "@matomezu/base:book-update",
      { settings: { "@matomezu/flowchart:flow-direction": "right" } },
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
      { page: page().id, item: "@matomezu/shape:shape-trapezoid", at: { x: 40, y: 40 } },
      on,
    )
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page: page().id, item: "@matomezu/shape:shape-trapezoid", at: { x: 300, y: 40 }, props: { turned: true } },
      on,
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
      "@matomezu/base:book-update",
      { settings: { "@matomezu/flowchart:flow-direction": "right" } },
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
      { page: page().id, item: "@matomezu/shape:shape-trapezoid", at: { x: 40, y: 40 } },
      on,
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
      "@matomezu/base:book-update",
      { settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
  })
  act(() =>
    store.actions.openDialog("s1", "@matomezu/shape:trapezoid-add", { page: page().id, at: { x: 400, y: 300 } }),
  )
  const add = screen.getByRole("dialog", { name: "形の追加" })
  expect(within(add).getByRole("switch", { name: "90 度回転" }).getAttribute("aria-checked")).toBe("true")
})

test("確認のダイアログで「台形の向きを合わせる」をオンにして実行すると、台形を流れの向きにそろえてから整える（最初はオフ）", () => {
  const f = flowchart()
  const { store, on, page } = f
  act(() => {
    store.actions.perform(
      "@matomezu/base:book-update",
      { settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page: page().id, item: "@matomezu/shape:shape-trapezoid", at: { x: 40, y: 40 } },
      on,
    )
  })
  const t = shapesOf(page())[0]!
  act(() => store.actions.openDialog("s1", "@matomezu/flowchart:page-align", { page: page().id }))
  const dialog = screen.getByRole("dialog", { name: "自動で整列" })
  // 切り替えの名前は、見える文字としても出す
  expect(within(dialog).getByText("台形をページに合わせて整列")).toBeTruthy()
  const toggle = within(dialog).getByRole("switch", { name: "台形をページに合わせて整列" })
  expect(toggle.getAttribute("aria-checked")).toBe("false")
  fireEvent.click(toggle)
  fireEvent.click(within(dialog).getByRole("button", { name: "実行" }))
  const after = shapesOf(page()).find(s => s.id === t.id)!
  expect(after.props).toMatchObject({ turned: true })
})

test("90 度回転した台形は、キャプションが伸びたら縦に広がる（流れが右へなら上下の真ん中を保つ）。押されて縮むときも、キャプションが見える高さより低くしない", () => {
  const { store, on, page } = flowchart()
  act(() => {
    store.actions.perform(
      "@matomezu/base:book-update",
      { settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
    store.actions.perform(
      "@matomezu/paper:item-place",
      {
        page: page().id,
        item: "@matomezu/shape:shape-trapezoid",
        at: { x: 300, y: 300 },
        props: { caption: "a", turned: true },
      },
      on,
    )
  })
  const t = shapesOf(page())[0]!
  const rect = () => rectsOf(store.catalog.core, page()).get(t.id)!
  const before = rect()
  act(() => {
    store.actions.perform(
      "@matomezu/paper:item-update",
      { page: page().id, item: t.id, props: { caption: "とても長いキャプションです" } },
      on,
    )
  })
  expect(rect().h).toBeGreaterThan(before.h)
  expect(rect().w).toBe(before.w)
  expect(Math.abs(rect().y + rect().h / 2 - (before.y + before.h / 2))).toBeLessThanOrEqual(1)
  expect(floorsOf(store.catalog.core, page()).get(t.id)!.h).toBe(rect().h)
})

test("確認のダイアログの切り替えは、仲間の形をまとめた名前で呼ぶ（台形（逆）だけが変わるときも「台形」）", () => {
  const { store, on, page } = flowchart()
  act(() => {
    store.actions.perform(
      "@matomezu/base:book-update",
      { settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page: page().id, item: "@matomezu/shape:shape-trapezoid-reversed", at: { x: 40, y: 40 } },
      on,
    )
  })
  act(() => store.actions.openDialog("s1", "@matomezu/flowchart:page-align", { page: page().id }))
  const dialog = screen.getByRole("dialog", { name: "自動で整列" })
  expect(within(dialog).getByText("台形をページに合わせて整列")).toBeTruthy()
})

test("流れの向きはページにも持て、ページの設定では「ブック継承」か下へ・右へのボタンで選ぶ。ページが右へなら、ブックが下へでも右へで並べる", () => {
  const f = flowchart()
  const { store, on, page } = f
  const ids = chart(f)
  act(() => store.actions.openDialog("s1", "@matomezu/base:page-settings", { page: page().id }))
  const dialog = screen.getByRole("dialog", { name: "ページの設定" })
  const choices = within(within(dialog).getByRole("group", { name: "流れの向き" })).getAllByRole("radio")
  expect(choices.map(c => c.getAttribute("aria-label"))).toEqual(["ブックを継承（下へ）", "下へ", "右へ"])
  expect((choices[0] as HTMLInputElement).checked).toBe(true)
  // 継承のボタンは文字で出す（線の既定の通り方と流れの向きの 2 つ）
  expect(within(dialog).getAllByText("ブック継承")).toHaveLength(2)
  fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }))
  act(() => {
    expect(
      store.actions.perform(
        "@matomezu/base:page-update",
        { page: page().id, settings: { "@matomezu/flowchart:flow-direction": "right" } },
        on,
      ).ok,
    ).toBe(true)
  })
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", { page: page().id }, on).ok).toBe(true)
  })
  const rects = rectsOf(store.catalog.core, page())
  const cy = (id: string) => rects.get(id)!.y + rects.get(id)!.h / 2
  expect(new Set([ids.start, ids.work, ids.branch, ids.end].map(cy)).size).toBe(1)
})
