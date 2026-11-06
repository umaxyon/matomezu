// マークダウンのソースのペイン（markdown の view/SourcePane.tsx）: 書いた物をページの原文に送り、続けて書いた物を 1 つの画面の履歴の段にまとめ、
// ほかからの変更に合わせ、ロック中は書けない。元に戻すのキーは base のコマンド、Tab キーは設定の項目の字
import { afterEach, expect, setSystemTime, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { BookOf } from "../../web/src/core/schema/book"
import { addPageIn, createBookIn } from "../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(() => {
  cleanup()
  setSystemTime()
})

function setup() {
  const store = createMatomezu({ home: "@matomezu/master:master", lang: "ja", plugins: BUILTIN_UI, partial: true })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  act(() => {
    createBookIn(store, "s1", { title: "メモ", type: "@matomezu/markdown:markdown" })
    addPageIn(store, "s1", { title: "ページ 1" })
  })
  const id = (store.state.getState().workspace.stages[0]!.opened as { book: string }).book
  const book = () => store.state.getState().books[id] as BookOf<"@matomezu/markdown:markdown">
  const text = () => book().pages[0]!.text ?? ""
  const field = () => within(screen.getByRole("region", { name: "ソース" })).getByRole("textbox") as HTMLTextAreaElement
  const undos = () => store.state.getState().history[id]?.undo.length ?? 0
  const settle = () => act(() => Promise.resolve())
  // 書く所を末尾に置いて value を書いたことにする
  const type = (value: string) => {
    const el = field()
    act(() => {
      fireEvent.change(el, { target: { value, selectionStart: value.length, selectionEnd: value.length } })
    })
  }
  return { store, id, book, text, field, undos, settle, type }
}

const at = (ms: number) => setSystemTime(new Date(Date.UTC(2026, 10, 3, 0, 0, 0, ms)))

test("書いた物はページの原文になり、描いた文書も変わる。間を空けずに続けて書いた物は 1 つの画面の履歴の段", async () => {
  const { text, type, undos, settle } = setup()
  at(0)
  type("# A")
  await settle()
  at(500)
  type("# AB")
  await settle()
  expect(text()).toBe("# AB")
  expect(within(screen.getByRole("region", { name: "プレビュー" })).getByRole("heading").textContent).toBe("AB")
  expect(undos()).toBe(1)
  // 1 秒空けて書くと、別の画面の履歴の段
  at(2000)
  type("# ABC")
  await settle()
  expect(undos()).toBe(2)
})

test("Mod+Z で、テキストFormの中からも元に戻す（画面の履歴）。元に戻したあとに書いた物は、残っている画面の履歴の段に足さない", async () => {
  const { text, type, field, undos, settle } = setup()
  at(0)
  type("a")
  await settle()
  at(5000)
  type("ab")
  await settle()
  act(() => {
    fireEvent.keyDown(field(), { key: "z", ctrlKey: true })
  })
  expect(text()).toBe("a")
  expect(field().value).toBe("a")
  at(5200)
  type("aX")
  await settle()
  expect(undos()).toBe(2)
  act(() => {
    fireEvent.keyDown(field(), { key: "z", ctrlKey: true })
  })
  expect(text()).toBe("a")
})

test("ほかから原文が変わると、テキストFormもその原文になる。日本語の変換中は変換が終わってから合わせ、書いた物も送る", async () => {
  const { store, id, book, text, field, type, settle } = setup()
  type("foo\n")
  await settle()
  const page = book().pages[0]!.id
  act(() => {
    store.actions.perform(
      "@matomezu/base:page-update",
      { page, fields: { find: "foo", replace: "AI foo" } },
      { book: id },
    )
  })
  expect(field().value).toBe("AI foo\n")
  // 変換中に AI が先頭に行を足す
  fireEvent.compositionStart(field())
  act(() => {
    fireEvent.change(field(), { target: { value: "AI foo\nあ", selectionStart: 8, selectionEnd: 8 } })
  })
  act(() => {
    store.actions.perform(
      "@matomezu/base:page-update",
      { page, fields: { find: "AI", replace: "# T\nAI" } },
      { book: id },
    )
  })
  expect(field().value).toBe("AI foo\nあ")
  act(() => {
    fireEvent.compositionEnd(field())
  })
  expect(text()).toBe("# T\nAI foo\nあ")
  expect(field().value).toBe("# T\nAI foo\nあ")
})

test("ページを変えられない間（ロック中）は、テキストFormに書けない", () => {
  const { store, id, field } = setup()
  expect(field().readOnly).toBe(false)
  act(() => {
    store.actions.perform("@matomezu/base:book-lock", {}, { book: id })
  })
  expect(field().readOnly).toBe(true)
})

test("Tab キーは、利用者の設定の項目で選んだ字を書く（既定は Tab 文字）。設定画面の「全体」の「Tabキー」で、半角スペースと数・Tab を切り替える", async () => {
  const { store, text, field, type, settle } = setup()
  type("a")
  await settle()
  act(() => {
    field().setSelectionRange(1, 1)
    fireEvent.keyDown(field(), { key: "Tab" })
  })
  expect(text()).toBe("a\t")
  act(() => {
    store.actions.perform("@matomezu/base:settings-set", {
      values: { "@matomezu/markdown:tab-key": { writes: "spaces", spaces: 2 } },
    })
  })
  act(() => {
    field().setSelectionRange(0, 0)
    fireEvent.keyDown(field(), { key: "Tab" })
  })
  expect(text()).toBe("  a\t")
})

test("設定画面の「全体」の「Tabキー」: 押している方を見せ、Tab を選んでいる間に選び替えた数は、半角スペースに戻したときに使う", () => {
  const store = createMatomezu({ home: "@matomezu/master:master", lang: "ja", plugins: BUILTIN_UI, partial: true })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  const value = () => store.state.getState().settings["@matomezu/markdown:tab-key"]
  fireEvent.click(screen.getByRole("button", { name: "設定を開く" }))
  const general = screen.getByRole("tabpanel", { name: "全体" })
  const spaces = within(general).getByRole("button", { name: "半角スペース" })
  const tab = within(general).getByRole("button", { name: "Tab" })
  expect(tab.getAttribute("aria-pressed")).toBe("true")
  expect(spaces.getAttribute("aria-pressed")).toBe("false")
  fireEvent.change(within(general).getByLabelText("半角スペースの数"), { target: { value: "2" } })
  expect(value()).toEqual({ writes: "tab", spaces: 2 })
  fireEvent.click(spaces)
  expect(value()).toEqual({ writes: "spaces", spaces: 2 })
  expect(within(general).getByRole("button", { name: "半角スペース" }).getAttribute("aria-pressed")).toBe("true")
  fireEvent.change(within(general).getByLabelText("半角スペースの数"), { target: { value: "4" } })
  expect(value()).toEqual({ writes: "spaces", spaces: 4 })
})

test("日本語の変換を続けて確定した物も、間を空けなければ 1 つの画面の履歴の段", async () => {
  const { text, field, undos, settle } = setup()
  at(0)
  const word = (value: string, ms: number) => {
    at(ms)
    fireEvent.compositionStart(field())
    act(() => {
      fireEvent.change(field(), { target: { value, selectionStart: value.length, selectionEnd: value.length } })
    })
    fireEvent.select(field())
    act(() => {
      fireEvent.compositionEnd(field())
    })
    fireEvent.select(field())
  }
  word("あ", 0)
  await settle()
  word("あい", 300)
  await settle()
  expect(text()).toBe("あい")
  expect(undos()).toBe(1)
})
