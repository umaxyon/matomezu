import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { z } from "zod"
import { defineBookType } from "../../web/src/core/def/book-type"
import { BUILTIN } from "../../web/src/plugins"
import { BASE_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/base/ui"
import { BUILTIN_UI } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { defineDialog } from "../../web/src/store/dialogs"
import { definePlugin } from "../../web/src/store/plugin"
import { App } from "../../web/src/ui/App"
import { assembleUi, type DialogProps, definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

// 外のプラグインの見本（型の表には書き足さないので、app は partial で作る）
const NOTE = defineBookType({
  id: "notes/note",
  version: 1,
  title: "図面",
  schema: z.strictObject({ type: z.literal("notes/note"), id: z.string().min(1), title: z.string() }),
  single: false,
  create: init => ({ type: "notes/note" as const, ...init }),
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: { allowed: [], defaults: [] },
  theme: "standard",
  tokens: [],
})
const notes = definePlugin({ id: "notes", bookTypes: [NOTE], dialogs: [defineDialog({ id: "notes/shot" })] })
const NoteView = () => <p>note view</p>
const ShotDialog = (_: DialogProps) => <p>shot</p>
const MyNewBook = ({ onClose }: DialogProps) => (
  <button type="button" onClick={onClose}>
    my new book
  </button>
)
const notesUi = definePluginUi(notes, {
  bookViews: { "notes/note": NoteView },
  dialogViews: { "notes/shot": ShotDialog },
  overrides: { dialogViews: { "book.new": MyNewBook } },
})

const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return e
  }
}

describe("見た目のプラグイン", () => {
  test("外のプラグインのビューで描き、差し替えたダイアログを中の部品のコマンドが開く", () => {
    const app = createMatomezu({ plugins: [...BUILTIN_UI, notesUi], partial: true, newId: () => "n1" })
    render(
      <MatomezuProvider app={app} layout={DEFAULT_LAYOUT}>
        <App />
      </MatomezuProvider>,
    )
    act(() => {
      app.actions.createBook("s1", { title: "メモ", type: "notes/note" })
    })
    expect(screen.getByText("note view")).toBeTruthy()
    act(() => app.actions.openMaster("s1"))
    fireEvent.click(screen.getByRole("button", { name: "新しいブック" }))
    expect(screen.getByRole("button", { name: "my new book" })).toBeTruthy()
  })

  test("見た目の表は、プラグインのビューと差し替えから作る", () => {
    const ui = assembleUi([...BUILTIN_UI, notesUi])
    expect(ui.bookViews.get("notes/note")).toBe(NoteView)
    expect(ui.dialogViews.get("book.new")).toBe(MyNewBook)
    expect(ui.dialogViews.get("book.open")).toBe(BASE_UI.ui.dialogViews["book.open"])
  })

  test("見た目を結んでいないプラグイン・ビューの無い id・知らない id の差し替え・2 つの差し替えは誤り", () => {
    expect(thrown(() => assembleUi([...BUILTIN_UI, notes]))).toMatchObject({ code: "E203" })
    // @ts-expect-error ダイアログのビューが無い
    const missing = definePluginUi(notes, { bookViews: { "notes/note": NoteView } })
    expect(thrown(() => assembleUi([...BUILTIN_UI, missing]))).toMatchObject({ code: "E204" })
    const unknown = definePluginUi(notes, {
      bookViews: { "notes/note": NoteView },
      dialogViews: { "notes/shot": ShotDialog },
      // @ts-expect-error 型の表に無い id は差し替えられない
      overrides: { dialogViews: { "book.nope": MyNewBook } },
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, unknown]))).toMatchObject({ code: "E205" })
    const again = definePluginUi(definePlugin({ id: "again" }), {
      overrides: { dialogViews: { "book.new": MyNewBook } },
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, notesUi, again]))).toMatchObject({ code: "E206" })
  })

  test("見た目を結んでいないプラグインの app は、画面に置けない（型の誤り）", () => {
    const app = createMatomezu({ plugins: BUILTIN })
    const typeOnly = () => (
      // @ts-expect-error 見た目を結んでいない
      <MatomezuProvider app={app} layout={DEFAULT_LAYOUT}>
        {null}
      </MatomezuProvider>
    )
    expect(typeOnly).toBeFunction()
  })
})
