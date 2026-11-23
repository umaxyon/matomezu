import { afterEach, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { StrictMode } from "react"
import { pagesOf } from "../../web/src/core/book"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { screenOf } from "../../web/src/core/window"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import type { StoreOptions } from "../../web/src/store/state"
import { definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { WindowRoot } from "../../web/src/ui/WindowRoot"
import { drawingPage, MARKDOWN, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { SAMPLE_BOOKS } from "../sample-books"
import { savedRows, settleIn, showFirstBook } from "../support"

const SKIN = "@matomezu/base:skin"

afterEach(cleanup)

function renderBooksScreen(options: Omit<StoreOptions, "plugins"> = {}) {
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
    ...options,
    plugins: BUILTIN_UI,
  })
  showFirstBook(store)
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  return store
}

const stages = () => screen.getAllByRole("region", { name: "ステージ" })

// i 番目のステージの下の行のブックの名前のボタンを押してフッタメニューを出し、その中のボタンを返す（閉じたフッタメニューのボタンは見えない）
function fromMenu(name: string, i = 0): HTMLElement {
  const triggers = [...document.querySelectorAll<HTMLElement>('button[aria-haspopup="menu"]')]
  const trigger = triggers[i]!
  fireEvent.click(trigger)
  return within(trigger.parentElement?.nextElementSibling as HTMLElement).getByRole("button", { name })
}

test("ステージに紙が 1 枚あり、下の行のフッタメニューにツールボックス（箱・リスト・データと、シェイプパネルを開く「形」）がある", () => {
  renderBooksScreen()
  expect(stages()).toHaveLength(1)
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1)
  // フッタメニューは閉じているので、読み上げには出ていない
  expect(screen.queryByRole("toolbar", { name: "ツール" })).toBeNull()
  const tools = screen.getByRole("toolbar", { name: "ツール", hidden: true })
  expect(
    within(tools)
      .getAllByRole("button", { hidden: true })
      .map(b => b.getAttribute("aria-label")),
  ).toEqual(["箱", "リスト", "データ", "形"])
  expect(screen.getByRole("button", { name: "まとめ図の構想" }).getAttribute("aria-expanded")).toBe("false")
})

// 下に出た書庫のスクリーンの、右の枠の中身
const lowerLibrary = () => screen.getAllByRole("list", { name: "書庫 の中身", hidden: true }).at(-1)!

test("分割すると、右のステージは何も開いておらず、下に書庫のスクリーンが出る。もう一度押すと 1 つに戻る", () => {
  renderBooksScreen()
  expect(screen.queryByRole("button", { name: "画面を分割" })).toBeNull()
  fireEvent.click(fromMenu("画面を分割"))
  // 分割すると、同じボタンは「分割をやめる」になり、押されている見た目になる
  expect(fromMenu("分割をやめる").getAttribute("aria-pressed")).toBe("true")
  expect(stages()).toHaveLength(2)
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1)
  expect(within(stages()[1]!).queryByRole("combobox")).toBeNull()
  expect(screen.getAllByRole("list", { name: "書庫 の中身", hidden: true })).toHaveLength(2)
  fireEvent.click(fromMenu("分割をやめる"))
  expect(stages()).toHaveLength(1)
})

test("下に出た書庫で 2 回押したブックを右で開き、右にそのブックのタブが出る", () => {
  renderBooksScreen()
  fireEvent.click(fromMenu("画面を分割"))
  fireEvent.doubleClick(within(lowerLibrary()).getByRole("button", { name: "残課題", hidden: true }))
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(2)
  expect(screen.getAllByRole("tablist").map(l => l.getAttribute("aria-label"))).toEqual(["まとめ図の構想", "残課題"])
})

test("書庫の右クリックのメニューで、ロックしたブックの行の「名前の変更…」「ゴミ箱に入れる」は、出たまま押せない。ロックしていないブックの行は押せる", () => {
  const store = renderBooksScreen()
  const perform = store.actions.perform as (id: string, args: unknown, on?: unknown) => { ok: boolean }
  act(() => {
    expect(perform("@matomezu/base:book-lock", {}, { book: "b3" }).ok).toBe(true)
  })
  fireEvent.click(fromMenu("画面を分割"))
  const rows = (book: string) => {
    fireEvent.contextMenu(within(lowerLibrary()).getByRole("button", { name: book, hidden: true }))
    const menu = screen.getByRole("menu")
    const disabled = ["名前の変更…", "ゴミ箱に入れる"].map(
      name => (within(menu).getByRole("menuitem", { name: new RegExp(`^${name}`) }) as HTMLButtonElement).disabled,
    )
    fireEvent.keyDown(document, { key: "Escape" })
    return disabled
  }
  expect(rows("残課題")).toEqual([true, true])
  expect(rows("データの形")).toEqual([false, false])
})

test("＋でページを作るダイアログが開き（紙は A 判とレター・タブロイド・16:9）、名前と紙を決めて作ると、そのタブが選ばれる。名前が空なら作れない", () => {
  renderBooksScreen()
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "図面" }))
  const dialog = screen.getByRole("dialog", { name: /^新しい/ })
  const name = within(dialog).getByLabelText("ページの名前") as HTMLInputElement
  expect(name.value).toBe("ページ 2")
  expect((within(dialog).getByLabelText("紙のサイズ") as HTMLSelectElement).value).toBe("@matomezu/base:a4")
  expect(
    Array.from((within(dialog).getByLabelText("紙のサイズ") as HTMLSelectElement).options).map(o => o.textContent),
  ).toEqual(["A5", "A4", "A3", "レター", "タブロイド", "スライド用(16:9)"])
  expect((within(dialog).getByLabelText("向き") as HTMLSelectElement).value).toBe("landscape")
  fireEvent.change(name, { target: { value: "  " } })
  expect((within(dialog).getByRole("button", { name: "作成" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(name, { target: { value: "裏表紙" } })
  fireEvent.change(within(dialog).getByLabelText("紙のサイズ"), { target: { value: "@matomezu/base:a5" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "作成" }))
  const tabs = screen.getAllByRole("tab")
  expect(tabs.map(t => t.textContent)).toEqual(["ページ 1", "裏表紙"])
  expect(tabs[1]!.getAttribute("aria-selected")).toBe("true")
  expect(screen.queryByRole("dialog", { name: /^新しい/ })).toBeNull()
})

test("言語を英語にすると、画面の文言が英語になり、＋で足すページの名前の案も英語になる", () => {
  renderBooksScreen({ books: SAMPLE_BOOKS, lang: "en" })
  fireEvent.click(screen.getByRole("button", { name: "Add page" }))
  // ＋のメニューの行は、機能台帳のページのタイプ（開いているページのタイプが先頭）
  expect(screen.getAllByRole("menuitem").map(m => m.textContent)[0]).toBe("Drawing")
  fireEvent.click(screen.getByRole("menuitem", { name: "Drawing" }))
  const dialog = screen.getByRole("dialog", { name: /^New / })
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }))
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["ページ 1", "Page 2"])
  fireEvent.click(fromMenu("Split screen"))
  expect(screen.getAllByRole("list", { name: "Contents of Library", hidden: true }).length).toBeGreaterThan(0)
  expect(document.documentElement.lang).toBe("en")
})

test("分割すると、それぞれのステージの下の行の頭に閉じるボタンが出て、閉じると残りのステージだけになる", () => {
  renderBooksScreen()
  expect(screen.queryByRole("button", { name: "ステージを閉じる" })).toBeNull()
  fireEvent.click(fromMenu("画面を分割"))
  const footer = screen.getAllByRole("button", { name: "ステージを閉じる" })
  expect(footer).toHaveLength(2)
  expect(footer.every(b => b.hasAttribute("data-footer-close"))).toBe(true)
  fireEvent.click(footer[0]!)
  expect(stages()).toHaveLength(1)
  expect(screen.queryByRole("img", { name: "紙" })).toBeNull()
  expect(screen.queryByRole("button", { name: "ステージを閉じる" })).toBeNull()
  expect(fromMenu("画面を分割").getAttribute("aria-pressed")).toBe("false")
})

test("分割すると、それぞれのステージの下の行の右端に □ が出て、押すとそのステージだけを広げ、もう一度で戻す", () => {
  renderBooksScreen()
  expect(screen.queryByRole("button", { name: "ステージを広げる" })).toBeNull()
  fireEvent.click(fromMenu("画面を分割"))
  const widen = screen.getAllByRole("button", { name: "ステージを広げる" })
  expect(widen).toHaveLength(2)
  fireEvent.click(widen[0]!)
  const hidden = () => [...document.querySelectorAll("[data-hidden]")].map(c => c.getAttribute("data-hidden"))
  expect(hidden()).toEqual(["false", "true"])
  const restore = screen.getByRole("button", { name: "ステージを戻す" })
  expect(restore.getAttribute("aria-pressed")).toBe("true")
  fireEvent.click(restore)
  expect(hidden()).toEqual(["false", "false"])
  // 右を広げると、右がカレントのステージになる
  fireEvent.click(screen.getAllByRole("button", { name: "ステージを広げる" })[1]!)
  expect(hidden()).toEqual(["true", "false"])
  const current = () => [...document.querySelectorAll("[data-hidden]")].map(c => c.getAttribute("data-current"))
  expect(current()).toEqual(["false", "true"])
})

test("ステージを広げたまま分割をやめ、もう一度分割すると、どちらのステージも隠れない", () => {
  renderBooksScreen()
  fireEvent.click(fromMenu("画面を分割"))
  fireEvent.click(screen.getAllByRole("button", { name: "ステージを広げる" })[0]!)
  fireEvent.click(fromMenu("分割をやめる"))
  fireEvent.click(fromMenu("画面を分割"))
  const hidden = [...document.querySelectorAll("[data-hidden]")].map(c => c.getAttribute("data-hidden"))
  expect(hidden).toEqual(["false", "false"])
})

test("新しいブックのダイアログでブックを作ると、そのステージでページの無いブックが開き、ページを作ると最初のタブができる", () => {
  const store = renderBooksScreen()
  // 起動したときのホストと同じく、書庫を整える（ダイアログは置くフォルダを言わずに作るので、ドキュメントが要る）
  act(() => void settleIn(store))
  act(() => store.actions.openDialog("s1", "@matomezu/base:book-new"))
  const dialog = screen.getByRole("dialog", { name: "新しいブック" })
  // 聞くのは名前だけ（タイプはページが持つ）
  expect(within(dialog).queryByLabelText("ブックのタイプ")).toBeNull()
  expect((within(dialog).getByRole("button", { name: "作成" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(within(dialog).getByLabelText("ブックの名前"), { target: { value: "新しい図" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "作成" }))
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("新しい図")
  expect(screen.queryAllByRole("tab")).toHaveLength(0)
  expect(screen.queryByRole("img", { name: "紙" })).toBeNull()
  // 作ったブックは、ドキュメントの、名前がその日の日付のフォルダに入る
  const { folders } = store.state.getState()
  const made = Object.values(folders).find(f => (f as { title?: string }).title === "新しい図")!
  const holder = Object.values(folders).find(f => f.lineup.some(r => r.id === made.id))
  expect((holder as { title?: string }).title).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  // ページタブの＋はタイプの一覧を出す（ページを開いていなければ機能台帳の順）
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  expect(screen.getAllByRole("menuitem").map(m => m.textContent)).toEqual([
    "図面",
    "フローチャート",
    "ツリー",
    "ディレクトリ構成図",
    "マークダウン",
    "スライド",
  ])
  fireEvent.click(screen.getByRole("menuitem", { name: "図面" }))
  const page = screen.getByRole("dialog", { name: /^新しい/ })
  expect((within(page).getByLabelText("ページの名前") as HTMLInputElement).value).toBe("ページ 1")
  fireEvent.click(within(page).getByRole("button", { name: "作成" }))
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["ページ 1"])
  expect(screen.getByRole("img", { name: "紙" })).toBeTruthy()
})

test("設定画面の「全体」で言語とスキンを変える", () => {
  renderBooksScreen()
  fireEvent.click(screen.getByRole("button", { name: "全体設定", hidden: true }))
  fireEvent.change(screen.getByLabelText("言語"), { target: { value: "matomezu:en" } })
  expect(screen.getByRole("tab", { name: "General" })).toBeTruthy()
  fireEvent.change(screen.getByLabelText("Skin"), { target: { value: "@matomezu/base:light" } })
  expect(document.documentElement.dataset.skin).toBe("@matomezu/base:light")
})

test("インスタンスに無いスキンが設定に残っていても、自動のスキンで描く（data-skin を付けない）", () => {
  const store = renderBooksScreen()
  act(() => {
    store.actions.perform("@matomezu/base:settings-set", { values: { [SKIN]: "@matomezu/base:light" } }).ok
  })
  expect(document.documentElement.dataset.skin).toBe("@matomezu/base:light")
  cleanup()
  // 外したスキンが設定に残っている状態から描く
  const kept = store.state.getState()
  renderBooksScreen({ initial: { ...kept, settings: { ...kept.settings, [SKIN]: "removed-skin" } } })
  expect(document.documentElement.dataset.skin).toBeUndefined()
})

test("文字の変換中の Escape ではダイアログを閉じず、変換していない Escape で閉じる", () => {
  const store = renderBooksScreen()
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "図面" }))
  const name = within(screen.getByRole("dialog", { name: /^新しい/ })).getByRole("textbox")
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
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
    plugins: [locked, ...rest],
  })
  showFirstBook(store)
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  expect((fromMenu("画面を分割") as HTMLButtonElement).disabled).toBe(true)
})

test("表に無い紙のページは、代わりの紙に「不明な紙」と示して描き、データの紙の id は残す", () => {
  const book = testBook("x", "外した紙", [
    drawingPage("p1", { title: "ページ 1", paper: "b5", orientation: "portrait" }),
  ])
  const store = renderBooksScreen({ books: [book] })
  expect(screen.getAllByText("不明な紙")).toHaveLength(1)
  expect(store.state.getState().books.x).toEqual(book)
})

test("スライドのページも、表に無い紙なら「不明な紙」の印を 1 つ出す（紙の知らせはプレゼンテーションに依らず base のレイヤーが出す）", () => {
  const book = testBook("x", "外した紙", [
    testBinder("b1", "スライド", SLIDE, testPage(SLIDE, "p1", { title: "1", paper: "b5", orientation: "landscape" })),
  ])
  renderBooksScreen({ books: [book] })
  expect(screen.getAllByText("不明な紙")).toHaveLength(1)
})

test("紙を置かないプレゼンテーション（マークダウン）には、紙の印を出さない", () => {
  const book = testBook("x", "マークダウン", [
    testPage(MARKDOWN, "p1", { title: "1", paper: "b5", orientation: "portrait" }),
  ])
  renderBooksScreen({ books: [book] })
  expect(screen.queryByText("不明な紙")).toBeNull()
})

test("StrictMode で描いても、開いたダイアログは閉じない", async () => {
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
    plugins: BUILTIN_UI,
  })
  showFirstBook(store)
  render(
    <StrictMode>
      <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
        <WindowRoot />
      </MatomezuProvider>
    </StrictMode>,
  )
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "図面" }))
  await new Promise(r => setTimeout(r, 50))
  expect(store.state.getState().dialog).toMatchObject({ id: "@matomezu/base:page-new" })
  expect(screen.getByRole("dialog", { name: /^新しい/ })).toBeTruthy()
})

test("図面の画面を右クリックすると押した位置にメニュー（一番上にページ全体を収める・初めの位置に戻す・画面の分割・スクリーンを閉じる、区切り線の下に貼り付け、区切り線の下にスクラップを切り抜く・ページの設定・ブックの設定）が出て、設定を押すと閉じて設定のダイアログが開く", () => {
  renderBooksScreen()
  const paper = screen.getByRole("img", { name: "紙" })
  const notCanceled = fireEvent.contextMenu(paper, { clientX: 40, clientY: 50 })
  expect(notCanceled).toBe(false) // ブラウザのメニューは出さない
  const menu = screen.getByRole("menu")
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map(b => b.textContent),
  ).toEqual([
    "ページ全体を収める",
    "初めの位置に戻すHome",
    "画面を分割",
    "スクリーンを閉じる",
    "貼り付け",
    "スクラップを切り抜く",
    "ページの設定",
    "ブックの設定",
  ])
  // 一番上の 3 つ（ページ全体を収める・初めの位置に戻す・画面の分割）の下と、貼り付けの下に区切り線
  expect(within(menu).getAllByRole("separator")).toHaveLength(2)
  fireEvent.click(within(menu).getByRole("menuitem", { name: "ブックの設定" }))
  expect(screen.queryByRole("menu")).toBeNull()
  const dialog = screen.getByRole("dialog", { name: "ブックの設定" })
  fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }))
  expect(screen.queryByRole("dialog")).toBeNull()
})

test("ページの設定のダイアログの「ページを削除」は、確かめてからページを消す。やめれば消さない", () => {
  const store = renderBooksScreen()
  const pages = () => pagesOf(store.state.getState().books.b1!).length
  const before = pages()
  const open = () => {
    fireEvent.contextMenu(screen.getByRole("img", { name: "紙" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "ページの設定" }))
    fireEvent.click(screen.getByRole("button", { name: "ページを削除" }))
    return screen.getByRole("alertdialog", { name: "ページと中身が消えます" })
  }
  fireEvent.click(within(open()).getByRole("button", { name: "キャンセル" }))
  expect(screen.queryByRole("alertdialog")).toBeNull()
  expect(pages()).toBe(before)
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "ページの設定" })).getByRole("button", { name: "キャンセル" }),
  )
  fireEvent.click(within(open()).getByRole("button", { name: "削除" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(pages()).toBe(before - 1)
})

test("認可ステップがページの削除を止めていれば、ページの設定のダイアログの「ページを削除」は押せない", () => {
  const kit = pluginKit("@ex/keep", defineMessages({ keep: { en: "Keep pages", ja: "ページを残す" } }))
  const keep = definePluginUi(
    kit.plugin({
      permissions: [
        kit.definePermission({
          id: "keep",
          title: "keep",
          aiDescription: "pages are kept",
          denies: ({ action }) => action.id === "@matomezu/base:page-remove",
        }),
      ],
    }),
    {},
  )
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
    plugins: [...BUILTIN_UI, keep],
    partial: true,
  })
  showFirstBook(store)
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  fireEvent.contextMenu(screen.getByRole("img", { name: "紙" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "ページの設定" }))
  expect((screen.getByRole("button", { name: "ページを削除" }) as HTMLButtonElement).disabled).toBe(true)
})

test("右クリックのメニューは、外を押すか Escape で閉じる", () => {
  renderBooksScreen()
  const paper = screen.getByRole("img", { name: "紙" })
  fireEvent.contextMenu(paper)
  fireEvent.pointerDown(paper)
  expect(screen.queryByRole("menu")).toBeNull()
  fireEvent.contextMenu(paper)
  fireEvent.keyDown(document, { key: "Escape" })
  expect(screen.queryByRole("menu")).toBeNull()
})

test("右クリックのメニューに出るコマンドが無ければ、メニューは出さない（ブラウザのメニューも出さない）", () => {
  const store = createMatomezu({
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
    plugins: BUILTIN_UI,
  })
  showFirstBook(store)
  // 分割をやめるは、分割していないと出ない
  const layout = {
    ...DEFAULT_LAYOUT,
    id: "unsplit-only",
    contextMenus: { "@matomezu/paper:paper-context": ["@matomezu/base:stage-unsplit"] },
  } as const
  render(
    <MatomezuProvider instance={store} layout={layout}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  const notCanceled = fireEvent.contextMenu(screen.getByRole("img", { name: "紙" }))
  expect(notCanceled).toBe(false)
  expect(screen.queryByRole("menu")).toBeNull()
  expect(store.state.getState().contextMenu).toBeNull()
})

test("ステージの上の行と下の行を右クリックしても、ブラウザのメニューを出さない", () => {
  renderBooksScreen()
  const tabs = screen.getByRole("tablist") // タブそのものの右クリックはページのメニュー（ページ一覧と同じ）。タブの列の何も無い所は、ブラウザのメニューを出さない
  expect(fireEvent.contextMenu(tabs)).toBe(false)
  const tool = screen.getByRole("button", { name: "選択ツール" })
  expect(fireEvent.contextMenu(tool)).toBe(false)
  expect(screen.queryByRole("menu")).toBeNull()
})

test("読めないブックは読み込まない（データには手を付けない）。読めないページを持つブックも、ブックごと読めない", () => {
  // ページのタイプが機能台帳に無いページを持つブックは、ブックごと読めない（W027）
  const gone = testBook("x1", "スタンプ帳", [
    { ...drawingPage("q1", { title: "1" }), type: "@foo/stamps:board" } as never,
  ])
  // 並びに同じ名前のページが 2 つあるブックは、並びの決まりを守らない（W006）
  const twins = testBook("x3", "双子", [drawingPage("q2", { title: "同じ" }), drawingPage("q3", { title: "同じ" })])
  const broken = { id: "x2", title: "壊れた図面", lineup: "?" }
  const store = renderBooksScreen({ saved: savedRows([gone, twins, broken]) })
  expect(store.state.getState().books.x1).toBeUndefined()
  expect(store.state.getState().books.x3).toBeUndefined()
  expect(store.state.getState().unreadable.map(w => [w.code, w.params.book])).toEqual([
    ["W027", "x1"],
    ["W006", "x3"],
    ["W005", "x2"],
  ])
})

test("一部のプラグインが無いブックは開け、知らない形は枠だけで描き、ダブルクリックしても編集のダイアログは出ない", () => {
  const book = testBook("u1", "星の残る図", [
    drawingPage("p1", { title: "P", items: [{ id: "s", item: "@foo/stars:star", x: 40, y: 40, props: {} }] }),
  ])
  const store = renderBooksScreen({ books: [], saved: savedRows([book]) })
  act(() => store.actions.openBook("s1", "u1"))
  const star = document.querySelector<HTMLElement>('[data-item="s"]')!
  expect(star.style.width).toBe("64px")
  expect(star.textContent).toBe("") // ビューは無く、枠だけ
  fireEvent.doubleClick(star)
  expect(screen.queryByRole("dialog")).toBeNull()
})

test("内包ボックスの子は親の中に描き、子に付いた線も描く。押すと一番内側の子だけを選び、ダブルクリックで子の編集のダイアログを開く", () => {
  const box = (id: string, x: number, y: number, w: number, h: number, shapes?: unknown[]) => ({
    id,
    item: "@matomezu/box:shape-nest-box",
    x,
    y,
    w,
    h,
    props: { caption: id },
    ...(shapes ? { shapes } : {}),
  })
  const book = testBook("n1", "内包", [
    drawingPage("p1", {
      title: "P",
      items: [
        box("a", 40, 40, 400, 300, [box("b", 20, 60, 200, 150, [box("c", 10, 50, 100, 60)])]),
        box("d", 600, 40, 100, 60),
        { id: "l1", item: "@matomezu/line:connector-line", from: "d", to: "c", props: {} },
      ],
    }),
  ])
  const store = renderBooksScreen({ books: [], saved: savedRows([book]) })
  act(() => store.actions.openBook("s1", "n1"))
  const item = (id: string) => document.querySelector<HTMLElement>(`[data-item="${id}"]`)!
  expect(item("a").contains(item("b"))).toBe(true)
  expect(item("b").contains(item("c"))).toBe(true)
  expect([item("c").style.left, item("c").style.top]).toEqual(["10px", "50px"])
  // 子に付いた線も描く
  expect(document.querySelector('svg [data-item="l1"]')).not.toBeNull()
  fireEvent.pointerDown(item("c"), { button: 0, pointerId: 1 })
  expect(screenOf(store.state.getState().window).stages[0]!.selection).toEqual(["c"])
  fireEvent.pointerUp(item("c"), { button: 0, pointerId: 1 })
  fireEvent.pointerDown(item("b"), { button: 0, pointerId: 2 })
  expect(screenOf(store.state.getState().window).stages[0]!.selection).toEqual(["b"])
  fireEvent.pointerUp(item("b"), { button: 0, pointerId: 2 })
  fireEvent.doubleClick(item("c"))
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByDisplayValue("c")).toBeTruthy()
})

test("本文のある箱を選ぶと本文の列の端につまみが出て（中央寄せは左右、左寄せは右だけ）、ドラッグで本文の幅を書く", () => {
  const box = (id: string, x: number, captionAlign: string) => ({
    id,
    item: "@matomezu/box:shape-nest-box",
    x,
    y: 40,
    w: 220,
    h: 140,
    props: { caption: "見出し", body: "本文の幅を縮めるための長い文です。", captionAlign },
  })
  const book = testBook("w1", "幅", [
    drawingPage("p1", { title: "P", items: [box("c", 40, "center"), box("l", 400, "left")] }),
  ])
  const store = renderBooksScreen({ books: [], saved: savedRows([book]) })
  act(() => store.actions.openBook("s1", "w1"))
  const item = (id: string) => document.querySelector<HTMLElement>(`[data-item="${id}"]`)!
  const grips = (id: string) =>
    [...item(id).querySelectorAll("[data-body-grip]")].map(g => g.getAttribute("data-body-grip"))
  expect(grips("c")).toEqual([]) // 選ぶまでは出さない
  const pick = (id: string) => {
    fireEvent.pointerDown(item(id), { button: 0, pointerId: 1 })
    fireEvent.pointerUp(item(id), { button: 0, pointerId: 1 })
  }
  pick("c")
  expect(grips("c")).toEqual(["left", "right"])
  pick("l")
  expect(grips("l")).toEqual(["right"])
  const grip = item("l").querySelector<HTMLElement>('[data-body-grip="right"]')!
  fireEvent.pointerDown(grip, { button: 0, pointerId: 2, clientX: 300 })
  fireEvent.pointerMove(grip, { pointerId: 2, clientX: 260 })
  fireEvent.pointerUp(grip, { pointerId: 2, clientX: 260 })
  const placed = pagesOf(store.state.getState().books.w1!)[0]!.items![1]!
  expect(placed.props).toMatchObject({ bodyWidth: 220 - 18 - 40 })
  expect(item("l").querySelector<HTMLElement>("hr")?.style.width).toBe(`${220 - 18 - 40}px`) // 区切り線も本文の列の幅
})

test("紙の右クリックのメニューの「画面を分割」で分割し、分割している間は同じ所に「ステージを閉じる」が出て、右クリックした側のステージを閉じる", () => {
  renderBooksScreen()
  fireEvent.contextMenu(screen.getAllByRole("img", { name: "紙" })[0]!, { clientX: 40, clientY: 50 })
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "画面を分割" }))
  expect(stages()).toHaveLength(2)
  const [left, right] = stages()
  fireEvent.contextMenu(within(left!).getByRole("img", { name: "紙" }), { clientX: 40, clientY: 50 })
  const menu = screen.getByRole("menu")
  expect(within(menu).getAllByRole("menuitem")[2]?.textContent).toBe("ステージを閉じる")
  fireEvent.click(within(menu).getByRole("menuitem", { name: "ステージを閉じる" }))
  expect(stages()).toEqual([right!])
})
