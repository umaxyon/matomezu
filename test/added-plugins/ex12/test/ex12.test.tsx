import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  BUILTIN_CONTROL_CENTER,
  BUILTIN_UI,
  createMatomezu,
  DEFAULT_LAYOUT,
  MatomezuProvider,
  placeAdded,
  WindowRoot,
} from "matomezu/testing"
import EX12_UI from "../ui"

afterEach(cleanup)

const make = () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, EX12_UI],
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
  })
  // 最初のブックを窓に出す（ブックが無ければ、何も開かないステージのブックスクリーンを開く）
  if (!instance.actions.showBook(Object.keys(instance.state.getState().books)[0] ?? ""))
    instance.actions.openScreen("@matomezu/base:book-screen", {})
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  return instance
}

const rows = () => [...document.querySelectorAll("[data-ex12-row]")].map(e => e.getAttribute("data-ex12-row"))
const current = () => document.querySelector('[data-ex12-row][data-current="true"]')?.getAttribute("data-ex12-row")
const panel = (row: string) => document.querySelector(`[data-ex12-row="${row}"] [data-ex12-panel]`)
const heightOf = (id: string) =>
  (document.querySelector(`[data-ex12-row="${id}"] [data-ex12-screen]`) as HTMLElement).style.height

test("縦に並べるスクリーンアレンジメントに替えると、開いているスクリーンが全部並び、下の行は出ない。1 枚ずつに戻せる", () => {
  const instance = make()
  const window = () => instance.state.getState().window
  expect(window().arrangement).toBe("@matomezu/base:one-screen")
  expect(document.querySelector("[data-ex12-stack]")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "縦に並べる" }))
  expect(window().arrangement).toBe("ex12:stack")
  // 最初から開いているコントロールセンターと、ブックスクリーンが並ぶ
  expect(rows()).toEqual(window().screens.map(s => s.id))
  expect(rows()).toHaveLength(2)
  expect(screen.queryByRole("button", { name: "コントロールセンター" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "1 枚ずつ" }))
  expect(window().arrangement).toBe("@matomezu/base:one-screen")
  expect(document.querySelector("[data-ex12-stack]")).toBeNull()
})

test("同じ定義のスクリーンを何枚でも開いて並べ、スクリーンごとの高さを持つ。閉じると高さの値も消える", () => {
  const instance = make()
  fireEvent.click(screen.getByRole("button", { name: "縦に並べる" }))
  fireEvent.click(screen.getByRole("button", { name: "パネルを足す" }))
  fireEvent.click(screen.getByRole("button", { name: "パネルを足す" }))
  expect(rows()).toHaveLength(4)
  const [first, second] = rows().slice(2) as [string, string]
  expect(panel(first)?.textContent).toBe("パネル 1")
  expect(panel(second)?.textContent).toBe("パネル 2")
  // 高さはスクリーンごと（既定 240px）。変えた値は、そのスクリーンの値として画面の場所に入る
  expect(heightOf(first)).toBe("240px")
  fireEvent.click(document.querySelector(`[data-ex12-row="${first}"] button`) as HTMLElement)
  expect(heightOf(first)).toBe("340px")
  expect(heightOf(second)).toBe("240px")
  expect(instance.address().screens.find(s => s.id === first)?.states).toEqual({ "ex12:height": 340 })
  expect(instance.address().screens.find(s => s.id === first)?.props).toEqual({ label: "パネル 1" })
  // 閉じる
  fireEvent.click(document.querySelectorAll(`[data-ex12-row="${first}"] button`)[1] as HTMLElement)
  expect(rows()).toHaveLength(3)
  expect(instance.state.getState().pluginValues.screens[first]).toBeUndefined()
})

test("並んだスクリーンのうち、押した 1 枚がカレントスクリーンになる（見えているのは全部のまま）", () => {
  make()
  fireEvent.click(screen.getByRole("button", { name: "縦に並べる" }))
  fireEvent.click(screen.getByRole("button", { name: "パネルを足す" }))
  fireEvent.click(screen.getByRole("button", { name: "パネルを足す" }))
  const [first, second] = rows().slice(2) as [string, string]
  expect(current()).toBe(second)
  fireEvent.pointerDown(panel(first) as HTMLElement)
  expect(current()).toBe(first)
  expect(panel(first)?.getAttribute("data-current")).toBe("true")
  expect(panel(second)?.getAttribute("data-current")).toBe("false")
  expect(panel(second)?.getAttribute("data-shown")).toBe("true")
})

test("ブックスクリーンを 2 枚並べると、どちらもステージを描き、2 枚目のステージにも操作が届く", () => {
  const instance = make()
  fireEvent.click(screen.getByRole("button", { name: "縦に並べる" }))
  fireEvent.click(screen.getAllByRole("button", { name: "ブックスクリーンを足す" })[0] as HTMLElement)
  const books = instance.state.getState().window.screens.filter(s => s.stages)
  expect(books).toHaveLength(2)
  expect(screen.getAllByRole("region", { name: "ステージ" })).toHaveLength(2)
  const stage = books[1]!.stages!.current
  instance.actions.resizeStage(stage, { w: 800, h: 240 })
  const second = () => instance.state.getState().window.screens.find(s => s.id === books[1]!.id)!.stages!
  expect(second().stages[0]!.view).toEqual({ w: 800, h: 240 })
})
