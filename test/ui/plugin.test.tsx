import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { z } from "zod"
import { defineBookType } from "../../web/src/core/def/book-type"
import { definePresentation } from "../../web/src/core/def/presentation"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { BASE_UI } from "../../web/src/plugins/base/ui"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { defineDialog } from "../../web/src/store/dialogs"
import { definePlugin } from "../../web/src/store/plugin"
import { assembleUi, type DialogProps, definePluginUi } from "../../web/src/ui/plugin"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

// 追加プラグインの見本（core/catalog.ts には書き足さないので、インスタンスは partial で作る）
const NOTE_LOOK = definePresentation({ id: "notes:note" })
const NOTE = defineBookType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  schema: z.strictObject({ type: z.literal("notes:note"), id: z.string().min(1) }),
  single: false,
  create: init => ({ type: "notes:note" as const, ...init }),
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  presentation: NOTE_LOOK.id,
  tokens: [],
})
const notes = definePlugin({
  id: "notes",
  bookTypes: [NOTE],
  presentations: [NOTE_LOOK],
  dialogs: [defineDialog({ id: "notes:shot" })],
})
const NoteView = () => <p>note view</p>
const ShotDialog = (_: DialogProps) => <p>shot</p>
const MyNewBook = ({ onClose }: DialogProps) => (
  <button type="button" onClick={onClose}>
    my new book
  </button>
)
const notesUi = definePluginUi(notes, {
  presentationViews: { "notes:note": { view: NoteView } },
  dialogViews: { "notes:shot": ShotDialog },
  overrides: { dialogViews: { "@matomezu/base:book-new": MyNewBook } },
})

const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return e
  }
}

describe("見た目のプラグイン", () => {
  test("追加プラグインのビューで描き、差し替えたダイアログをビルトインプラグインのコマンドが開く", () => {
    const instance = createMatomezu({
      plugins: [...BUILTIN_UI, notesUi],
      partial: true,
      home: "@matomezu/master:master",
      lang: "ja",
      newId: () => "n1",
    })
    render(
      <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
        <Screen />
      </MatomezuProvider>,
    )
    act(() => {
      createBookIn(instance, "s1", { title: "メモ", type: "notes:note" as never })
    })
    expect(screen.getByText("note view")).toBeTruthy()
    act(() => instance.actions.command("s1", "@matomezu/base:stage-home"))
    fireEvent.click(screen.getByRole("button", { name: "新しいブック" }))
    expect(screen.getByRole("button", { name: "my new book" })).toBeTruthy()
  })

  test("見た目の表は、プラグインのビューと差し替えから作る", () => {
    const ui = assembleUi([...BUILTIN_UI, notesUi])
    expect(ui.presentationViews.get("notes:note")?.view).toBe(NoteView)
    expect(ui.dialogViews.get("@matomezu/base:book-new")).toBe(MyNewBook)
    expect(ui.dialogViews.get("@matomezu/base:book-open")).toBe(BASE_UI.ui.dialogViews["@matomezu/base:book-open"])
  })

  test("コマンドのアイコンは自分のコマンドにだけ付けられる（ほかのプラグインのコマンドなら E307）", () => {
    const icons = definePluginUi(definePlugin({ id: "icons" }), {
      commandIcons: { "@matomezu/paper:paper-delete": <span /> },
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, icons]))).toMatchObject({ code: "E307" })
  })

  test("見た目を結んでいないプラグイン・ビューの無い id・知らない id の差し替え・2 つの差し替えは error", () => {
    expect(thrown(() => assembleUi([...BUILTIN_UI, notes]))).toMatchObject({ code: "E203" })
    // @ts-expect-error ダイアログのビューが無い
    const missing = definePluginUi(notes, { presentationViews: { "notes:note": { view: NoteView } } })
    expect(thrown(() => assembleUi([...BUILTIN_UI, missing]))).toMatchObject({ code: "E204" })
    const unknown = definePluginUi(notes, {
      presentationViews: { "notes:note": { view: NoteView } },
      dialogViews: { "notes:shot": ShotDialog },
      // @ts-expect-error core/catalog.ts に無い id は差し替えられない
      overrides: { dialogViews: { "book.nope": MyNewBook } },
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, unknown]))).toMatchObject({ code: "E205" })
    const again = definePluginUi(definePlugin({ id: "again" }), {
      overrides: { dialogViews: { "@matomezu/base:book-new": MyNewBook } },
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, notesUi, again]))).toMatchObject({ code: "E206" })
  })

  test("見た目を結んでいないプラグインのインスタンスは、画面に置けない（型の誤り）", () => {
    const instance = createMatomezu({ plugins: BUILTIN })
    const typeOnly = () => (
      // @ts-expect-error 見た目を結んでいない
      <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
        {null}
      </MatomezuProvider>
    )
    expect(typeOnly).toBeFunction()
  })
})
