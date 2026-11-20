// フローチャートのブック（@matomezu/flowchart）の画面: 流れの向きの設定・自動で整列と、その確認のダイアログ

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react"
import { shapesOf } from "../../../../web/src/core/placed"
import { rectsOf } from "../../../../web/src/plugins/base"
import { ownSettings } from "../../../../web/src/plugins/base/book-settings"
import { linesOf } from "../../../../web/src/plugins/items/line/placed"
import { ALIGN_MARGIN } from "../../../../web/src/plugins/page-types/flowchart/actions"
import { flowchart } from "./support"

afterEach(cleanup)

test("流れの向きはページの設定で、既定は下へ。右へに変えられる", () => {
  const { store, on, page } = flowchart()
  act(() => {
    expect(
      store.actions.perform(
        "@matomezu/base:pages-update",
        { pages: "all", settings: { "@matomezu/flowchart:flow-direction": "right" } },
        on,
      ).ok,
    ).toBe(true)
  })
  expect(ownSettings(page())).toMatchObject({ "@matomezu/flowchart:flow-direction": "right" })
})

// 開始 → 処理 → 分岐 → (Yes) 終了 / (No) 処理 2 の流れを置き、線でつなぐ（端は固定して引く）
function chart(f: ReturnType<typeof flowchart>) {
  const { store, page } = f
  const place = (item: string, x: number, y: number, caption: string) =>
    store.actions.perform("@matomezu/paper:item-place", { item, at: { x, y }, props: { caption } }, { page: page().id })
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
        { from, to, props: { exitAt: 0.3, enterAt: 0.7 } },
        { page: page().id },
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
  const { store, page } = f
  const ids = chart(f)
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", {}, { page: page().id }).ok).toBe(true)
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
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
  })
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", {}, { page: page().id }).ok).toBe(true)
  })
  const rects = rectsOf(store.catalog.core, page())
  const cy = (id: string) => rects.get(id)!.y + rects.get(id)!.h / 2
  const main = [ids.start, ids.work, ids.branch, ids.end].map(cy)
  expect(new Set(main).size).toBe(1)
  expect(cy(ids.work2)).toBeGreaterThan(main[0]!)
  expect(rects.get(ids.start)!.x).toBe(ALIGN_MARGIN)
})

test("自動で整列は、紙に収まらなければ断って何も変えない", () => {
  const { store, page } = flowchart()
  // 縦に 20 段の流れは A4 の縦に収まらない
  act(() => {
    for (let i = 0; i < 20; i++)
      store.actions.perform(
        "@matomezu/paper:item-place",
        { item: "@matomezu/box:shape-box", at: { x: 20 + (i % 5) * 150, y: 20 + Math.floor(i / 5) * 200 } },
        { page: page().id },
      )
  })
  const ids = shapesOf(page()).map(s => s.id)
  act(() => {
    for (let i = 1; i < ids.length; i++)
      store.actions.perform("@matomezu/line:line-connect", { from: ids[i - 1]!, to: ids[i]! }, { page: page().id })
  })
  const before = page()
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", {}, { page: page().id }).ok).toBe(false)
  })
  expect(page()).toBe(before)
})

test("可変ページの自動で整列は、紙 1 枚に収まらない流れも下へ並べ、印刷区画を増やす", () => {
  const { store, page } = flowchart()
  act(() => {
    expect(store.actions.perform("@matomezu/base:page-update", { grows: true }, { page: page().id }).ok).toBe(true)
    for (let i = 0; i < 20; i++)
      store.actions.perform(
        "@matomezu/paper:item-place",
        { item: "@matomezu/box:shape-box", at: { x: 20 + (i % 5) * 150, y: 20 + Math.floor(i / 5) * 200 } },
        { page: page().id },
      )
  })
  const ids = shapesOf(page()).map(s => s.id)
  act(() => {
    for (let i = 1; i < ids.length; i++)
      store.actions.perform("@matomezu/line:line-connect", { from: ids[i - 1]!, to: ids[i]! }, { page: page().id })
    expect(store.actions.perform("@matomezu/flowchart:page-align", {}, { page: page().id }).ok).toBe(true)
  })
  // A4 縦（高さ 1123）より下まで並ぶ
  expect(Math.max(...shapesOf(page()).map(s => s.y))).toBeGreaterThan(1123)
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
  const { store, page } = flowchart()
  act(() => {
    for (let i = 0; i < 20; i++)
      store.actions.perform(
        "@matomezu/paper:item-place",
        { item: "@matomezu/box:shape-box", at: { x: 20 + (i % 5) * 150, y: 20 + Math.floor(i / 5) * 200 } },
        { page: page().id },
      )
  })
  const ids = shapesOf(page()).map(s => s.id)
  act(() => {
    for (let i = 1; i < ids.length; i++)
      store.actions.perform("@matomezu/line:line-connect", { from: ids[i - 1]!, to: ids[i]! }, { page: page().id })
  })
  act(() => store.actions.openDialog("s1", "@matomezu/flowchart:page-align", { page: page().id }))
  const dialog = screen.getByRole("dialog", { name: "自動で整列" })
  fireEvent.click(within(dialog).getByRole("button", { name: "実行" }))
  expect(within(dialog).getByText("紙に収まりません")).toBeTruthy()
})

// 開始の形と箱をつないだチャートを n 個置く（チャートどうしはつながない）
function charts(f: ReturnType<typeof flowchart>, n: number) {
  const { store, page } = f
  act(() => {
    for (let i = 0; i < n; i++) {
      for (const [item, y] of [
        ["@matomezu/shape:shape-rounded", 20],
        ["@matomezu/box:shape-box", 200],
      ] as const)
        store.actions.perform(
          "@matomezu/paper:item-place",
          { item, at: { x: 20 + i * 140, y: y + (i % 2) * 300 }, props: { caption: `c${i}` } },
          { page: page().id },
        )
    }
  })
  const ids = shapesOf(page()).map(s => s.id)
  act(() => {
    for (let i = 0; i < n; i++)
      store.actions.perform(
        "@matomezu/line:line-connect",
        { from: ids[i * 2]!, to: ids[i * 2 + 1]! },
        { page: page().id },
      )
  })
  return Array.from({ length: n }, (_, i) => [ids[i * 2]!, ids[i * 2 + 1]!] as const)
}

test("自動で整列: つながっていないチャートは、上をそろえて左右に並べ、紙の幅を超えるなら折り返して下の段に置く", () => {
  const f = flowchart()
  const { store, page } = f
  const list = charts(f, 6)
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", {}, { page: page().id }).ok).toBe(true)
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

test("確認のダイアログで「台形の向きを合わせる」をオンにして実行すると、台形を流れの向きにそろえてから整える（最初はオフ）", () => {
  const f = flowchart()
  const { store, on, page } = f
  act(() => {
    store.actions.perform(
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
    store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/shape:shape-trapezoid", at: { x: 40, y: 40 } },
      { page: page().id },
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

test("確認のダイアログの切り替えは、仲間の形をまとめた名前で呼ぶ（台形（逆）だけが変わるときも「台形」）", () => {
  const { store, on, page } = flowchart()
  act(() => {
    store.actions.perform(
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/flowchart:flow-direction": "right" } },
      on,
    )
    store.actions.perform(
      "@matomezu/paper:item-place",
      { item: "@matomezu/shape:shape-trapezoid-reversed", at: { x: 40, y: 40 } },
      { page: page().id },
    )
  })
  act(() => store.actions.openDialog("s1", "@matomezu/flowchart:page-align", { page: page().id }))
  const dialog = screen.getByRole("dialog", { name: "自動で整列" })
  expect(within(dialog).getByText("台形をページに合わせて整列")).toBeTruthy()
})

test("流れの向きはページの設定で、下へ・右へのボタンで選ぶ（既定は下へ）。ページが右へなら、右へで並べる", () => {
  const f = flowchart()
  const { store, page } = f
  const ids = chart(f)
  act(() => store.actions.openDialog("s1", "@matomezu/base:page-settings", { page: page().id }))
  const dialog = screen.getByRole("dialog", { name: "ページの設定" })
  const choices = within(within(dialog).getByRole("group", { name: "流れの向き" })).getAllByRole("radio")
  expect(choices.map(c => c.getAttribute("aria-label"))).toEqual(["下へ", "右へ"])
  expect((choices[0] as HTMLInputElement).checked).toBe(true)
  fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }))
  act(() => {
    expect(
      store.actions.perform(
        "@matomezu/base:page-update",
        { settings: { "@matomezu/flowchart:flow-direction": "right" } },
        { page: page().id },
      ).ok,
    ).toBe(true)
  })
  act(() => {
    expect(store.actions.perform("@matomezu/flowchart:page-align", {}, { page: page().id }).ok).toBe(true)
  })
  const rects = rectsOf(store.catalog.core, page())
  const cy = (id: string) => rects.get(id)!.y + rects.get(id)!.h / 2
  expect(new Set([ids.start, ids.work, ids.branch, ids.end].map(cy)).size).toBe(1)
})
