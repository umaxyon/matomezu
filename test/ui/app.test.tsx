import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { SAMPLE_BOOKS } from "../../web/src/store/sample-books"
import { createAppStore, initialState } from "../../web/src/store/store"
import { App } from "../../web/src/ui/App"
import { StoreProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

function renderApp() {
  const store = createAppStore()
  render(
    <StoreProvider store={store}>
      <App />
    </StoreProvider>,
  )
  return store
}

const stages = () => screen.getAllByRole("region", { name: "ステージ" })

test("ステージに紙が 1 枚ある", () => {
  renderApp()
  expect(stages()).toHaveLength(1)
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1)
})

test("分割すると、右のステージは何も開いておらず、真ん中でブックを選べる。もう一度押すと 1 つに戻る", () => {
  renderApp()
  const button = screen.getByRole("button", { name: "画面を分割" })
  fireEvent.click(button)
  expect(button.getAttribute("aria-pressed")).toBe("true")
  expect(stages()).toHaveLength(2)
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1)
  const right = stages()[1]!
  expect(within(right).getByText("ブックを選択してください")).toBeTruthy()
  expect(within(right).getByRole("combobox", { name: "ブックを探す" })).toBeTruthy()
  fireEvent.click(button)
  expect(stages()).toHaveLength(1)
})

test("右のステージで探して選んだブックを右で開き、右にそのブックのタブが出る", () => {
  renderApp()
  fireEvent.click(screen.getByRole("button", { name: "画面を分割" }))
  const right = stages()[1]!
  const input = within(right).getByRole("combobox", { name: "ブックを探す" })
  fireEvent.change(input, { target: { value: "残課題" } })
  expect(
    within(right)
      .getAllByRole("option")
      .map(o => o.textContent),
  ).toEqual(["残課題"])
  fireEvent.keyDown(input, { key: "Enter" })
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(2)
  expect(screen.getAllByRole("tablist").map(l => l.getAttribute("aria-label"))).toEqual(["まとめ図の構想", "残課題"])
})

test("↑↓で選ぶ候補が動き、クリックでも選べる", () => {
  renderApp()
  fireEvent.click(screen.getByRole("button", { name: "画面を分割" }))
  const right = stages()[1]!
  const input = within(right).getByRole("combobox", { name: "ブックを探す" })
  const selected = () => within(right).getByRole("option", { selected: true }).textContent
  expect(selected()).toBe("マスター")
  fireEvent.keyDown(input, { key: "ArrowDown" })
  expect(selected()).toBe("まとめ図の構想")
  fireEvent.keyDown(input, { key: "ArrowUp" })
  fireEvent.keyDown(input, { key: "ArrowUp" })
  expect(selected()).toBe("Design Notes")
  fireEvent.click(within(right).getByRole("option", { name: "データの形" }))
  expect(screen.getAllByRole("tablist").map(l => l.getAttribute("aria-label"))).toEqual([
    "まとめ図の構想",
    "データの形",
  ])
})

test("タブの左のボタンでダイアログを開き、選んだブックをそのステージで開く", () => {
  renderApp()
  fireEvent.click(screen.getByRole("button", { name: "ブックを開く" }))
  const dialog = screen.getByRole("dialog", { name: "ブックを開く" })
  const input = within(dialog).getByRole("combobox", { name: "ブックを探す" })
  fireEvent.change(input, { target: { value: "api" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("API の一覧")
  expect(screen.queryByRole("combobox", { name: "ブックを探す" })).toBeNull()
})

test("＋でページが増え、そのタブが選ばれる", () => {
  renderApp()
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  const tabs = screen.getAllByRole("tab")
  expect(tabs.map(t => t.textContent)).toEqual(["ページ 1", "ページ 2"])
  expect(tabs[1]!.getAttribute("aria-selected")).toBe("true")
})

test("日本語の変換を確定する Enter では、候補を選ばない", () => {
  renderApp()
  fireEvent.click(screen.getByRole("button", { name: "ブックを開く" }))
  const dialog = screen.getByRole("dialog", { name: "ブックを開く" })
  const input = within(dialog).getByRole("combobox", { name: "ブックを探す" })
  fireEvent.keyDown(input, { key: "Enter", isComposing: true })
  expect(screen.getByRole("dialog", { name: "ブックを開く" })).toBeTruthy()
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("まとめ図の構想")
})

test("言語を英語にすると、画面の文言が英語になり、＋で足すページの題名も英語になる", () => {
  const store = createAppStore(initialState(SAMPLE_BOOKS, "en"))
  render(
    <StoreProvider store={store}>
      <App />
    </StoreProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Add page" }))
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["ページ 1", "Page 2"])
  fireEvent.click(screen.getByRole("button", { name: "Split screen" }))
  expect(screen.getByText("Select a book")).toBeTruthy()
  expect(document.documentElement.lang).toBe("en")
})

test("左上のマスターのボタンで、カレントのステージにマスターの画面が出る。紙もページのタブも無い", () => {
  renderApp()
  const button = screen.getByRole("button", { name: "マスター" })
  expect(button.getAttribute("aria-pressed")).toBe("false")
  fireEvent.click(button)
  expect(within(stages()[0]!).getByRole("region", { name: "マスター" })).toBeTruthy()
  expect(screen.queryByRole("img", { name: "紙" })).toBeNull()
  expect(screen.queryByRole("tablist")).toBeNull()
  expect(button.getAttribute("aria-pressed")).toBe("true")
})
