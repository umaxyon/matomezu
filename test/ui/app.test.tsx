import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { createMatomezu } from "../../web/src/store/create"
import { SAMPLE_BOOKS } from "../../web/src/store/sample-books"
import type { StoreOptions } from "../../web/src/store/store"
import { App } from "../../web/src/ui/App"
import { BUILTIN_UI } from "../../web/src/ui/builtin"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

function renderApp(options: Omit<StoreOptions, "plugins"> = {}) {
  const store = createMatomezu({ ...options, plugins: BUILTIN_UI })
  render(
    <MatomezuProvider app={store}>
      <App />
    </MatomezuProvider>,
  )
  return store
}

const stages = () => screen.getAllByRole("region", { name: "ステージ" })

// i 番目のステージの下の行の名前の欄を押してメニューを出し、その中のボタンを返す（閉じたメニューのボタンは見えない）
function fromMenu(name: string, i = 0): HTMLElement {
  const triggers = [...document.querySelectorAll<HTMLElement>("button[aria-expanded]")]
  const trigger = triggers[i]!
  fireEvent.click(trigger)
  return within(trigger.nextElementSibling as HTMLElement).getByRole("button", { name })
}

test("ステージに紙が 1 枚あり、上にツールボックス、下の行の左にブックの名前がある", () => {
  renderApp()
  expect(stages()).toHaveLength(1)
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1)
  const tools = screen.getByRole("toolbar", { name: "ツール" })
  expect(
    within(tools)
      .getAllByRole("button")
      .map(b => b.getAttribute("aria-label")),
  ).toEqual(["箱"])
  expect(screen.getByRole("button", { name: "まとめ図の構想" }).getAttribute("aria-expanded")).toBe("false")
})

test("分割すると、右のステージは何も開いておらず、真ん中でブックを選べる。もう一度押すと 1 つに戻る", () => {
  renderApp()
  expect(screen.queryByRole("button", { name: "画面を分割" })).toBeNull()
  fireEvent.click(fromMenu("画面を分割"))
  expect(fromMenu("画面を分割").getAttribute("aria-pressed")).toBe("true")
  expect(stages()).toHaveLength(2)
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1)
  const right = stages()[1]!
  expect(within(right).getByText("ブックを選択してください")).toBeTruthy()
  expect(within(right).getByRole("combobox", { name: "ブックを探す" })).toBeTruthy()
  fireEvent.click(fromMenu("画面を分割"))
  expect(stages()).toHaveLength(1)
})

test("右のステージで探して選んだブックを右で開き、右にそのブックのタブが出る", () => {
  renderApp()
  fireEvent.click(fromMenu("画面を分割"))
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
  fireEvent.click(fromMenu("画面を分割"))
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
  fireEvent.click(fromMenu("ブックを開く"))
  const dialog = screen.getByRole("dialog", { name: "ブックを開く" })
  const input = within(dialog).getByRole("combobox", { name: "ブックを探す" })
  fireEvent.change(input, { target: { value: "api" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("API の一覧")
  expect(screen.queryByRole("combobox", { name: "ブックを探す" })).toBeNull()
})

test("＋でページを作るダイアログが開き、名前と紙を決めて作ると、そのタブが選ばれる。名前が空なら作れない", () => {
  renderApp()
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  const dialog = screen.getByRole("dialog", { name: "新しいページ" })
  const name = within(dialog).getByLabelText("ページの名前") as HTMLInputElement
  expect(name.value).toBe("ページ 2")
  expect((within(dialog).getByLabelText("紙のサイズ") as HTMLSelectElement).value).toBe("a4")
  expect((within(dialog).getByLabelText("向き") as HTMLSelectElement).value).toBe("landscape")
  fireEvent.change(name, { target: { value: "  " } })
  expect((within(dialog).getByRole("button", { name: "作成" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(name, { target: { value: "裏表紙" } })
  fireEvent.change(within(dialog).getByLabelText("紙のサイズ"), { target: { value: "a5" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "作成" }))
  const tabs = screen.getAllByRole("tab")
  expect(tabs.map(t => t.textContent)).toEqual(["ページ 1", "裏表紙"])
  expect(tabs[1]!.getAttribute("aria-selected")).toBe("true")
  expect(screen.queryByRole("dialog", { name: "新しいページ" })).toBeNull()
})

test("日本語の変換を確定する Enter では、候補を選ばない", () => {
  renderApp()
  fireEvent.click(fromMenu("ブックを開く"))
  const dialog = screen.getByRole("dialog", { name: "ブックを開く" })
  const input = within(dialog).getByRole("combobox", { name: "ブックを探す" })
  fireEvent.keyDown(input, { key: "Enter", isComposing: true })
  expect(screen.getByRole("dialog", { name: "ブックを開く" })).toBeTruthy()
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("まとめ図の構想")
})

test("言語を英語にすると、画面の文言が英語になり、＋で足すページの名前の案も英語になる", () => {
  renderApp({ books: SAMPLE_BOOKS, lang: "en" })
  fireEvent.click(screen.getByRole("button", { name: "Add page" }))
  const dialog = screen.getByRole("dialog", { name: "New page" })
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }))
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["ページ 1", "Page 2"])
  fireEvent.click(fromMenu("Split screen"))
  expect(screen.getByText("Select a book")).toBeTruthy()
  expect(document.documentElement.lang).toBe("en")
})

test("名前の欄のメニューのマスターで、そのステージにマスターの画面が出る。紙もページのタブもツールも無い", () => {
  renderApp()
  const button = fromMenu("マスター")
  expect(button.getAttribute("aria-pressed")).toBe("false")
  fireEvent.click(button)
  expect(within(stages()[0]!).getByRole("region", { name: "マスター" })).toBeTruthy()
  expect(screen.queryByRole("img", { name: "紙" })).toBeNull()
  expect(screen.queryByRole("tablist")).toBeNull()
  expect(screen.queryByRole("toolbar")).toBeNull()
  expect(screen.getByRole("button", { name: "マスター", expanded: false }).textContent).toBe("マスター")
  expect(fromMenu("マスター").getAttribute("aria-pressed")).toBe("true")
})

test("分割すると、それぞれのステージの区画に閉じるボタンが出て、閉じると残りのステージだけになる", () => {
  renderApp()
  expect(screen.queryByRole("button", { name: "ステージを閉じる" })).toBeNull()
  fireEvent.click(fromMenu("画面を分割"))
  const closes = screen.getAllByRole("button", { name: "ステージを閉じる" })
  expect(closes).toHaveLength(2)
  fireEvent.click(closes[0]!)
  expect(stages()).toHaveLength(1)
  expect(within(stages()[0]!).getByText("ブックを選択してください")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "ステージを閉じる" })).toBeNull()
  expect(fromMenu("画面を分割").getAttribute("aria-pressed")).toBe("false")
})

test("マスターで新しいブックを作ると、そのステージでページの無いブックが開き、ページを作ると最初のタブができる", () => {
  renderApp()
  fireEvent.click(fromMenu("マスター"))
  fireEvent.click(screen.getByRole("button", { name: "新しいブック" }))
  const dialog = screen.getByRole("dialog", { name: "新しいブック" })
  const type = within(dialog).getByLabelText("ブックのタイプ") as HTMLSelectElement
  expect([...type.options].map(o => o.textContent)).toEqual(["図面"])
  expect((within(dialog).getByRole("button", { name: "作成" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(within(dialog).getByLabelText("ブックの名前"), { target: { value: "新しい図" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "作成" }))
  expect(screen.queryByRole("region", { name: "マスター" })).toBeNull()
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("新しい図")
  expect(screen.queryAllByRole("tab")).toHaveLength(0)
  expect(screen.queryByRole("img", { name: "紙" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "ページを作る" }))
  const page = screen.getByRole("dialog", { name: "新しいページ" })
  expect((within(page).getByLabelText("ページの名前") as HTMLInputElement).value).toBe("ページ 1")
  fireEvent.click(within(page).getByRole("button", { name: "作成" }))
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["ページ 1"])
  expect(screen.getByRole("img", { name: "紙" })).toBeTruthy()
})

test("マスターの設定で言語とスキンを変える", () => {
  renderApp()
  fireEvent.click(fromMenu("マスター"))
  fireEvent.change(screen.getByLabelText("言語"), { target: { value: "en" } })
  expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy()
  fireEvent.change(screen.getByLabelText("Skin"), { target: { value: "light" } })
  expect(document.documentElement.dataset.skin).toBe("light")
})

test("表に無い紙のページは、代わりの紙に「不明な紙」と示して描き、データの紙の id は残す", () => {
  const book = {
    type: "drawing" as const,
    id: "x",
    title: "外した紙",
    pages: [{ id: "p1", title: "ページ 1", paper: "b5", orientation: "portrait" as const }],
  }
  const store = renderApp({ books: [book] })
  expect(within(screen.getByRole("img", { name: "紙" })).getByText("不明な紙")).toBeTruthy()
  expect(store.state.getState().books.x).toEqual(book)
})
