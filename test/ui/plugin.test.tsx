import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, render, screen } from "@testing-library/react"
import { definePageType } from "../../web/src/core/def/page-type"
import { definePresentation } from "../../web/src/core/def/presentation"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { BASE_UI, defineAnnotationIcon, defineMailActions, defineWideSearchOpener } from "../../web/src/plugins/base/ui"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { defineDialog } from "../../web/src/store/dialogs"
import { definePlugin } from "../../web/src/store/plugin"
import { defineWidget } from "../../web/src/ui/layout"
import { assembleUi, type DialogProps, definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { WindowRoot } from "../../web/src/ui/WindowRoot"
import { showFirstBook } from "../support"

afterEach(cleanup)

// テストのプラグイン（型の core/catalog.ts は書き足さないので、インスタンスは partial で作る）
const NOTE_LOOK = definePresentation({ id: "notes:note" })
const NOTE = definePageType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape" },
  items: { allowed: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: NOTE_LOOK.id,
  tokens: [],
})
const notes = definePlugin({
  id: "notes",
  pageTypes: [NOTE],
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
    // id は n1、n2、… と振る（ブックとその最初のページの id は、重ならない）
    let made = 0
    const instance = createMatomezu({
      plugins: [...BUILTIN_UI, notesUi],
      partial: true,
      controlCenter: BUILTIN_CONTROL_CENTER,
      lang: "ja",
      newId: () => `n${++made}`,
    })
    showFirstBook(instance)
    render(
      <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
        <WindowRoot />
      </MatomezuProvider>,
    )
    act(() => {
      createBookIn(instance, "s1", { title: "メモ", page: { type: "notes:note" } as never })
    })
    expect(screen.getByText("note view")).toBeTruthy()
    act(() => instance.actions.openDialog("s1", "@matomezu/base:book-new"))
    expect(screen.getByRole("button", { name: "my new book" })).toBeTruthy()
  })

  test("見た目の表は、プラグインのビューと差し替えから作る", () => {
    const ui = assembleUi([...BUILTIN_UI, notesUi])
    expect(ui.presentationViews.get("notes:note")?.view).toBe(NoteView)
    expect(ui.dialogViews.get("@matomezu/base:book-new")).toBe(MyNewBook)
    expect(ui.dialogViews.get("@matomezu/base:binder-delete")).toBe(
      BASE_UI.ui.dialogViews["@matomezu/base:binder-delete"],
    )
  })

  test("見た目の表は、同じプラグインの配列なら組み直さず、別の配列なら組み直す", () => {
    const plugins = [...BUILTIN_UI, notesUi]
    expect(assembleUi(plugins)).toBe(assembleUi(plugins))
    expect(assembleUi([...plugins])).not.toBe(assembleUi(plugins))
  })

  test("コマンドのアイコンは自分のコマンドにだけ付けられる（ほかのプラグインのコマンドなら E307）", () => {
    const icons = definePluginUi(definePlugin({ id: "icons" }), {
      commandIcons: { "@matomezu/paper:paper-delete": <span /> },
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, icons]))).toMatchObject({ code: "E307" })
  })

  test("メニューが自分で出す行は、自分のメニューにだけ書ける（ほかのプラグインのメニューなら E315）", () => {
    const rows = definePluginUi(definePlugin({ id: "rows" }), {
      contextMenuRows: { "@matomezu/base:add-page-menu": () => [] } as never,
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, rows]))).toMatchObject({ code: "E315" })
    expect(assembleUi(BUILTIN_UI).contextMenuRows.has("@matomezu/base:add-page-menu")).toBe(true)
  })

  test("ページのタイプのアイコンは自分のタイプにだけ付けられる（ほかのプラグインのタイプなら E313）。名乗らないタイプは表に入らない", () => {
    const icons = definePluginUi(definePlugin({ id: "icons" }), {
      pageTypeIcons: { "@matomezu/drawing:drawing": <span /> },
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, icons]))).toMatchObject({ code: "E313" })
    const catalog = assembleUi(BUILTIN_UI)
    expect(catalog.pageTypeIcons.has("@matomezu/drawing:drawing")).toBe(true)
    expect(catalog.pageTypeIcons.has("@matomezu/nothing:nothing")).toBe(false)
  })

  test("列挙の値のアイコンは自分が足した値にだけ付けられる（ほかのプラグインの値なら E314）", () => {
    const icons = definePluginUi(definePlugin({ id: "icons" }), {
      enumValueIcons: { "@matomezu/drawing:node-icon": <span /> },
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, icons]))).toMatchObject({ code: "E314" })
    expect(assembleUi(BUILTIN_UI).enumValueIcons.has("@matomezu/drawing:node-icon")).toBe(true)
  })

  test("種類の持ち主のプラグインだけが、その種類の横断検索の開き方を名乗れる（持ち主が違えば E312、同じなら通る）", () => {
    const opener = (id: string, kind: string) =>
      defineWideSearchOpener({ id: id as never, kind, useOpen: () => () => "opened" as const })
    const other = definePluginUi(definePlugin({ id: "icons" }), {
      widgets: [opener("icons:open-ticket", "@matomezu/taskboard:ticket")],
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, other]))).toMatchObject({ code: "E312" })
    // forKind を書かずに名乗る物は、引かれない（wide-search-openers.test.ts）。forKind に他の種類を書けば、defineWidget で直接書いても E312
    const raw = definePluginUi(definePlugin({ id: "icons" }), {
      widgets: [
        defineWidget({
          id: "icons:raw",
          slots: [],
          forKind: "@matomezu/taskboard:ticket",
          view: () => null,
        } as never),
      ],
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, raw]))).toMatchObject({ code: "E312" })
    const own = definePluginUi(definePlugin({ id: "icons" }), { widgets: [opener("icons:open-note", "icons:note")] })
    expect(() => assembleUi([...BUILTIN_UI, own])).not.toThrow()
  })

  test("郵便のダイアログのボタンと送信トレイの行の絵も、種類の持ち主のプラグインだけが名乗れる（持ち主が違えば E312、同じなら通る）", () => {
    const actions = (id: string, mail: string) => defineMailActions({ id: id as never, mail, view: () => null })
    const icon = (id: string, annotation: string) =>
      defineAnnotationIcon({ id: id as never, annotation, view: () => null })
    const ui = (widgets: (ReturnType<typeof actions> | ReturnType<typeof icon>)[]) =>
      definePluginUi(definePlugin({ id: "icons" }), { widgets })
    expect(
      thrown(() => assembleUi([...BUILTIN_UI, ui([actions("icons:proposal", "@matomezu/base:proposal")])])),
    ).toMatchObject({
      code: "E312",
    })
    expect(thrown(() => assembleUi([...BUILTIN_UI, ui([icon("icons:note", "@matomezu/base:note")])]))).toMatchObject({
      code: "E312",
    })
    expect(() =>
      assembleUi([...BUILTIN_UI, ui([actions("icons:mine", "icons:mail"), icon("icons:mine-icon", "icons:mark")])]),
    ).not.toThrow()
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
    showFirstBook(instance)
    const typeOnly = () => (
      // @ts-expect-error 見た目を結んでいない
      <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
        {null}
      </MatomezuProvider>
    )
    expect(typeOnly).toBeFunction()
  })
})
