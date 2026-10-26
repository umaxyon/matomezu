import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { StrictMode } from "react"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { createMatomezu } from "../../web/src/store/create"
import type { StoreOptions } from "../../web/src/store/store"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

function renderScreen(options: Omit<StoreOptions, "plugins"> = {}) {
  const store = createMatomezu({
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
    ...options,
    plugins: BUILTIN_UI,
  })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
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
  renderScreen()
  expect(stages()).toHaveLength(1)
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1)
  const tools = screen.getByRole("toolbar", { name: "ツール" })
  expect(
    within(tools)
      .getAllByRole("button")
      .map(b => b.getAttribute("aria-label")),
  ).toEqual(["箱", "リスト"])
  expect(screen.getByRole("button", { name: "まとめ図の構想" }).getAttribute("aria-expanded")).toBe("false")
})

test("分割すると、右のステージは何も開いておらず、真ん中でブックを選べる。もう一度押すと 1 つに戻る", () => {
  renderScreen()
  expect(screen.queryByRole("button", { name: "画面を分割" })).toBeNull()
  fireEvent.click(fromMenu("画面を分割"))
  // 分割すると、同じボタンは「分割をやめる」になり、押されている見た目になる
  expect(fromMenu("分割をやめる").getAttribute("aria-pressed")).toBe("true")
  expect(stages()).toHaveLength(2)
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1)
  const right = stages()[1]!
  expect(within(right).getByText("ブックを選択してください")).toBeTruthy()
  expect(within(right).getByRole("combobox", { name: "ブックを探す" })).toBeTruthy()
  fireEvent.click(fromMenu("分割をやめる"))
  expect(stages()).toHaveLength(1)
})

test("右のステージで探して選んだブックを右で開き、右にそのブックのタブが出る", () => {
  renderScreen()
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
  renderScreen()
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
  renderScreen()
  fireEvent.click(fromMenu("ブックを開く"))
  const dialog = screen.getByRole("dialog", { name: "ブックを開く" })
  const input = within(dialog).getByRole("combobox", { name: "ブックを探す" })
  fireEvent.change(input, { target: { value: "api" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("API の一覧")
  expect(screen.queryByRole("combobox", { name: "ブックを探す" })).toBeNull()
})

test("＋でページを作るダイアログが開き、名前と紙を決めて作ると、そのタブが選ばれる。名前が空なら作れない", () => {
  renderScreen()
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  const dialog = screen.getByRole("dialog", { name: "新しいページ" })
  const name = within(dialog).getByLabelText("ページの名前") as HTMLInputElement
  expect(name.value).toBe("ページ 2")
  expect((within(dialog).getByLabelText("紙のサイズ") as HTMLSelectElement).value).toBe("@matomezu/base:a4")
  expect((within(dialog).getByLabelText("向き") as HTMLSelectElement).value).toBe("landscape")
  fireEvent.change(name, { target: { value: "  " } })
  expect((within(dialog).getByRole("button", { name: "作成" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(name, { target: { value: "裏表紙" } })
  fireEvent.change(within(dialog).getByLabelText("紙のサイズ"), { target: { value: "@matomezu/base:a5" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "作成" }))
  const tabs = screen.getAllByRole("tab")
  expect(tabs.map(t => t.textContent)).toEqual(["ページ 1", "裏表紙"])
  expect(tabs[1]!.getAttribute("aria-selected")).toBe("true")
  expect(screen.queryByRole("dialog", { name: "新しいページ" })).toBeNull()
})

test("日本語の変換を確定する Enter では、候補を選ばない", () => {
  renderScreen()
  fireEvent.click(fromMenu("ブックを開く"))
  const dialog = screen.getByRole("dialog", { name: "ブックを開く" })
  const input = within(dialog).getByRole("combobox", { name: "ブックを探す" })
  fireEvent.keyDown(input, { key: "Enter", isComposing: true })
  expect(screen.getByRole("dialog", { name: "ブックを開く" })).toBeTruthy()
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("まとめ図の構想")
})

test("言語を英語にすると、画面の文言が英語になり、＋で足すページの名前の案も英語になる", () => {
  renderScreen({ books: SAMPLE_BOOKS, lang: "en" })
  fireEvent.click(screen.getByRole("button", { name: "Add page" }))
  const dialog = screen.getByRole("dialog", { name: "New page" })
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }))
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["ページ 1", "Page 2"])
  fireEvent.click(fromMenu("Split screen"))
  expect(screen.getByText("Select a book")).toBeTruthy()
  expect(document.documentElement.lang).toBe("en")
})

test("名前の欄のメニューのマスターで、そのステージにマスターの画面が出る。紙もページのタブもツールも無い", () => {
  renderScreen()
  const button = fromMenu("ホーム")
  expect(button.getAttribute("aria-pressed")).toBe("false")
  fireEvent.click(button)
  expect(within(stages()[0]!).getByRole("region", { name: "マスター" })).toBeTruthy()
  expect(screen.queryByRole("img", { name: "紙" })).toBeNull()
  expect(screen.queryByRole("tablist")).toBeNull()
  expect(screen.queryByRole("toolbar")).toBeNull()
  expect(screen.getByRole("button", { name: "マスター", expanded: false }).textContent).toBe("マスター")
  expect(fromMenu("ホーム").getAttribute("aria-pressed")).toBe("true")
})

test("分割すると、それぞれのステージの区画に閉じるボタンが出て、閉じると残りのステージだけになる", () => {
  renderScreen()
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
  renderScreen()
  fireEvent.click(fromMenu("ホーム"))
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
  renderScreen()
  fireEvent.click(fromMenu("ホーム"))
  fireEvent.change(screen.getByLabelText("言語"), { target: { value: "en" } })
  expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy()
  fireEvent.change(screen.getByLabelText("Skin"), { target: { value: "@matomezu/base:light" } })
  expect(document.documentElement.dataset.skin).toBe("@matomezu/base:light")
})

test("インスタンスに無いスキンは選べず、設定に残っていても自動のスキンで描く（data-skin を付けない）", () => {
  const store = renderScreen()
  act(() => {
    store.actions.perform("@matomezu/base:settings-skin", { skin: "@matomezu/base:light" }).ok
  })
  expect(document.documentElement.dataset.skin).toBe("@matomezu/base:light")
  expect(store.actions.perform("@matomezu/base:settings-skin", { skin: "removed-skin" }).ok).toBe(false)
  cleanup()
  // 外したスキンが設定に残っている状態から描く
  const kept = store.state.getState()
  renderScreen({ initial: { ...kept, settings: { ...kept.settings, skin: "removed-skin" } } })
  expect(document.documentElement.dataset.skin).toBeUndefined()
})

test("文字の変換中の Escape ではダイアログを閉じず、変換していない Escape で閉じる", () => {
  const store = renderScreen()
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  const name = within(screen.getByRole("dialog", { name: "新しいページ" })).getByRole("textbox")
  fireEvent.keyDown(name, { key: "Escape", isComposing: true })
  expect(store.state.getState().dialog).toMatchObject({ id: "@matomezu/base:page-new" })
  fireEvent.keyDown(name, { key: "Escape" })
  expect(store.state.getState().dialog).toBeNull()
})

test("メニューのボタンは、コマンドが押せないとき押せない", () => {
  const [base, ...rest] = BUILTIN_UI
  const locked = {
    ...base,
    commands: base.commands.map(c => (c.id === "@matomezu/base:stage-split" ? { ...c, enabled: () => false } : c)),
  }
  const store = createMatomezu({
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
    plugins: [locked, ...rest],
  })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  expect((fromMenu("画面を分割") as HTMLButtonElement).disabled).toBe(true)
})

test("表に無い紙のページは、代わりの紙に「不明な紙」と示して描き、データの紙の id は残す", () => {
  const book = {
    type: "@matomezu/drawing:drawing" as const,
    id: "x",
    title: "外した紙",
    pages: [{ id: "p1", title: "ページ 1", paper: "b5", orientation: "portrait" as const }],
  }
  const store = renderScreen({ books: [book] })
  expect(within(screen.getByRole("img", { name: "紙" })).getByText("不明な紙")).toBeTruthy()
  expect(store.state.getState().books.x).toEqual(book)
})

test("StrictMode で描いても、開いたダイアログは閉じない", async () => {
  const store = createMatomezu({
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
    plugins: BUILTIN_UI,
  })
  render(
    <StrictMode>
      <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
        <Screen />
      </MatomezuProvider>
    </StrictMode>,
  )
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  await new Promise(r => setTimeout(r, 50))
  expect(store.state.getState().dialog).toMatchObject({ id: "@matomezu/base:page-new" })
  expect(screen.getByRole("dialog", { name: "新しいページ" })).toBeTruthy()
})

test("図面の画面を右クリックすると押した位置にメニュー（ページの設定・ブックの設定）が出て、設定を押すと閉じて設定のダイアログが開く", () => {
  renderScreen()
  const paper = screen.getByRole("img", { name: "紙" })
  const notCanceled = fireEvent.contextMenu(paper, { clientX: 40, clientY: 50 })
  expect(notCanceled).toBe(false) // ブラウザのメニューは出さない
  const menu = screen.getByRole("menu")
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map(b => b.textContent),
  ).toEqual(["ページの設定", "ブックの設定"])
  fireEvent.click(within(menu).getByRole("menuitem", { name: "ブックの設定" }))
  expect(screen.queryByRole("menu")).toBeNull()
  const dialog = screen.getByRole("dialog", { name: "ブックの設定" })
  fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }))
  expect(screen.queryByRole("dialog")).toBeNull()
})

test("右クリックのメニューは、外を押すか Escape で閉じる", () => {
  renderScreen()
  const paper = screen.getByRole("img", { name: "紙" })
  fireEvent.contextMenu(paper)
  fireEvent.pointerDown(paper)
  expect(screen.queryByRole("menu")).toBeNull()
  fireEvent.contextMenu(paper)
  fireEvent.keyDown(document, { key: "Escape" })
  expect(screen.queryByRole("menu")).toBeNull()
})

test("マスターの画面には右クリックのメニューが無く、ブラウザのメニューを止めない", () => {
  const store = renderScreen()
  act(() => store.actions.openBook("s1", "@matomezu/master:master"))
  const notCanceled = fireEvent.contextMenu(screen.getByRole("region", { name: "マスター" }))
  expect(notCanceled).toBe(true)
  expect(screen.queryByRole("menu")).toBeNull()
})

test("右クリックのメニューに出るコマンドが無ければ、メニューは出さない（ブラウザのメニューも出さない）", () => {
  const store = createMatomezu({
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
    plugins: BUILTIN_UI,
  })
  // 分割をやめるは、分割していないと出ない
  const layout = {
    ...DEFAULT_LAYOUT,
    id: "unsplit-only",
    contextMenus: { "@matomezu/paper:paper-context": ["@matomezu/base:stage-unsplit"] },
  } as const
  render(
    <MatomezuProvider instance={store} layout={layout}>
      <Screen />
    </MatomezuProvider>,
  )
  const notCanceled = fireEvent.contextMenu(screen.getByRole("img", { name: "紙" }))
  expect(notCanceled).toBe(false)
  expect(screen.queryByRole("menu")).toBeNull()
  expect(store.state.getState().contextMenu).toBeNull()
})

test("ステージの上の行と下の行を右クリックしても、ブラウザのメニューを出さない", () => {
  renderScreen()
  const tab = screen.getAllByRole("tab")[0]!
  expect(fireEvent.contextMenu(tab)).toBe(false)
  const tool = screen.getByRole("button", { name: "箱" })
  expect(fireEvent.contextMenu(tool)).toBe(false)
  expect(screen.queryByRole("menu")).toBeNull()
})

test("読めないブックは、ブックを開くの一覧に押せない行として、開けない理由を添えて出る（データには手を付けない）", () => {
  const gone = { type: "@foo/stamps:board", id: "x1", title: "スタンプ帳", pages: [] }
  const broken = { type: "@matomezu/drawing:drawing", id: "x2", title: "壊れた図面", pages: "?" }
  const store = renderScreen({ savedBooks: [gone, broken] })
  expect(store.state.getState().books.x1).toBeUndefined()
  fireEvent.click(fromMenu("ブックを開く"))
  const dialog = screen.getByRole("dialog", { name: "ブックを開く" })
  const rows = within(dialog)
    .getAllByRole("option")
    .filter(o => o.getAttribute("aria-disabled") === "true")
  expect(rows.map(r => r.textContent)).toEqual([
    "スタンプ帳開けません: ブックのタイプ @foo/stamps:board がありません",
    "壊れた図面開けません: ブックのタイプ @matomezu/drawing:drawing の形に合いません",
  ])
  // 押しても開かない
  fireEvent.click(rows[0]!)
  expect(screen.getByRole("dialog", { name: "ブックを開く" })).toBeTruthy()
  // 名前で絞り込める
  fireEvent.change(within(dialog).getByRole("combobox", { name: "ブックを探す" }), { target: { value: "スタンプ" } })
  expect(
    within(dialog)
      .getAllByRole("option")
      .map(o => o.getAttribute("aria-disabled")),
  ).toEqual(["true"])
})

test("一部のプラグインが無いブックは開け、知らない形は枠だけで描き、ダブルクリックしても編集のダイアログは出ない。一覧の名前の横に印が付く", () => {
  const book = {
    type: "@matomezu/drawing:drawing",
    id: "u1",
    title: "星の残る図",
    pages: [
      {
        id: "p1",
        title: "P",
        paper: "@matomezu/base:a4",
        orientation: "landscape",
        items: [{ id: "s", item: "@foo/stars:star", x: 40, y: 40, props: {} }],
      },
    ],
  }
  const store = renderScreen({ books: [], savedBooks: [book] })
  act(() => store.actions.openBook("s1", "u1"))
  const star = document.querySelector<HTMLElement>('[data-item="s"]')!
  expect(star.style.width).toBe("64px")
  expect(star.textContent).toBe("") // ビューは無く、枠だけ
  fireEvent.doubleClick(star)
  expect(screen.queryByRole("dialog")).toBeNull()
  fireEvent.click(fromMenu("ブックを開く"))
  const dialog = screen.getByRole("dialog", { name: "ブックを開く" })
  expect(within(dialog).getByRole("option", { name: /星の残る図/ }).textContent).toBe(
    "星の残る図一部表示できない物があります",
  )
})
