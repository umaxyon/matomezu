import { afterEach, describe, expect, test } from "bun:test"
import { cleanup, render, screen, within } from "@testing-library/react"
import { isMatomezuError, problemText } from "../../web/src/core/errors"
import { defineWorkspace, STAGE_BASE_SLOTS } from "../../web/src/plugins/base/ui"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { App } from "../../web/src/ui/App"
import { checkLayout, defineLayout, defineWidget, type LayoutDef, tidySeparators } from "../../web/src/ui/layout"
import { assembleUi, definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

const app = () => createMatomezu({ plugins: BUILTIN_UI, home: "master", books: SAMPLE_BOOKS, lang: "ja" })
const ui = assembleUi(BUILTIN_UI)
const commands = new Set(app().commands.keys())

// タブを上の行に移した配置
const TABS_ON_TOP = defineLayout({
  ...DEFAULT_LAYOUT,
  id: "tabs-on-top",
  slots: { ...DEFAULT_LAYOUT.slots, "stage.top": ["toolbox", "page-tabs"], "stage.bottom": ["book-name"] },
})

describe("配置", () => {
  test("既定の配置には食い違いが無い", () => {
    expect(checkLayout(DEFAULT_LAYOUT, ui, commands)).toEqual([])
  })

  test("知らないウィジェット・置けないスロット・app に無いコマンドは誤り", () => {
    const bad = {
      id: "bad",
      slots: { app: ["workspace"], "stage.top": ["nope", "book-view"], "stage.bottom": ["book-name"] },
      menus: { "stage.menu": [{ either: ["stage.split", "stage.nope"] }] },
    } as unknown as LayoutDef
    expect(checkLayout(bad, ui, commands).map(problemText)).toEqual([
      "E207 layout bad: slot stage.top has unknown widget nope",
      "E208 layout bad: widget book-view cannot be placed in slot stage.top",
      "E209 layout bad: menu stage.menu has unknown command stage.nope",
    ])
  })

  test("中身を書いたのに、置いたウィジェットのどれも開けないスロットとメニューは誤り", () => {
    // 根にステージの骨組みが無いので、ステージのスロットもメニューも画面に出ない
    const noStages = defineLayout({
      ...DEFAULT_LAYOUT,
      id: "no-stages",
      slots: { ...DEFAULT_LAYOUT.slots, app: ["dialog-host"] },
    })
    expect(checkLayout(noStages, ui, commands).map(problemText)).toEqual([
      "E211 layout no-stages: slot stage.top is not opened by any placed widget",
      "E211 layout no-stages: slot stage.body is not opened by any placed widget",
      "E211 layout no-stages: slot stage.bottom is not opened by any placed widget",
      "E211 layout no-stages: slot stage.corner is not opened by any placed widget",
      "E212 layout no-stages: menu stage.menu is not shown by any placed widget",
    ])
    // 中身を書かなければ、ステージの無い画面にできる
    const bare = defineLayout({ id: "bare", slots: { app: ["dialog-host"] }, menus: {} })
    expect(checkLayout(bare, ui, commands)).toEqual([])
  })

  test("ステージの骨組みは defineWorkspace で差し替えられる（ベーススロットを全部開ける）", () => {
    const MyWorkspace = () => <p>my workspace</p>
    const MY_WORKSPACE = defineWorkspace({ id: "w/workspace", view: MyWorkspace })
    expect(MY_WORKSPACE.opens).toEqual(STAGE_BASE_SLOTS)
    const mine = definePluginUi(definePlugin({ id: "w" }), { widgets: [MY_WORKSPACE] })
    const widgets = assembleUi([...BUILTIN_UI, mine]).widgets
    const layout = {
      ...DEFAULT_LAYOUT,
      id: "mine",
      slots: { ...DEFAULT_LAYOUT.slots, app: ["w/workspace", "dialog-host"] },
    }
    expect(checkLayout(layout as unknown as LayoutDef, { ...ui, widgets }, commands)).toEqual([])
  })

  test("右クリックのメニューの app に無いコマンドと、どの部品も開かないメニューは誤り", () => {
    const bad = {
      ...DEFAULT_LAYOUT,
      id: "bad",
      contextMenus: { "drawing.context": ["drawing.nope"], "other.context": ["stage.home"] },
    } as unknown as LayoutDef
    expect(checkLayout(bad, ui, commands).map(problemText)).toEqual([
      "E209 layout bad: menu drawing.context has unknown command drawing.nope",
      "E213 layout bad: context menu other.context is not opened by any placed widget or book view",
    ])
  })

  test("右クリックのメニューに置けるのは、引数の無いコマンドと受け取る物を引数に取れるコマンドだけ", () => {
    defineLayout({
      ...DEFAULT_LAYOUT,
      id: "typed",
      // @ts-expect-error page.open はページの id を受け取るが、図面のメニューは何も渡さない
      contextMenus: { "drawing.context": ["drawing.settings", "page.open"] },
    })
  })

  test("食い違いのある配置は、画面に置くときに誤り", () => {
    const bad = { id: "bad", slots: { app: ["nope"] }, menus: {} } as unknown as LayoutDef
    let thrown: unknown
    try {
      render(
        <MatomezuProvider app={app()} layout={bad}>
          <App />
        </MatomezuProvider>,
      )
    } catch (e) {
      thrown = e
    }
    expect(isMatomezuError(thrown) && thrown.code).toBe("E210")
  })

  test("配置の型: 置けないスロット・知らないウィジェット・引数の要るコマンドは型の誤り（行わない）", () => {
    const typeOnly = () => {
      // @ts-expect-error ブックのビューの置き場は、ステージの本体にしか置けない
      defineLayout({ id: "x", slots: { "stage.top": ["book-view"] }, menus: {} })
      // @ts-expect-error 知らないウィジェット
      defineLayout({ id: "x", slots: { "stage.top": ["nope"] }, menus: {} })
      // @ts-expect-error page.open はページの id を取るので、メニューに置けない
      defineLayout({ id: "x", slots: {}, menus: { "stage.menu": ["page.open"] } })
    }
    expect(typeOnly).toBeFunction()
  })

  test("配置を替えると、その場で組み直す（タブを上の行へ）", () => {
    const a = app()
    const { rerender } = render(
      <MatomezuProvider app={a} layout={DEFAULT_LAYOUT}>
        <App />
      </MatomezuProvider>,
    )
    const toolbar = () => screen.getByRole("toolbar", { name: "ツール" }).parentElement!
    expect(within(toolbar()).queryByRole("tablist")).toBeNull()
    rerender(
      <MatomezuProvider app={a} layout={TABS_ON_TOP}>
        <App />
      </MatomezuProvider>,
    )
    expect(within(toolbar()).getByRole("tablist")).toBeTruthy()
  })
})

describe("ウィジェット", () => {
  const Ping = () => <p>ping</p>

  test("外のプラグインのウィジェットは、頭にプラグインの id と / を付ける", () => {
    const bad = definePluginUi(definePlugin({ id: "w" }), {
      widgets: [defineWidget({ id: "ping", slots: ["app"], view: Ping })],
    })
    expect(() => assembleUi([...BUILTIN_UI, bad])).toThrow("E301")
  })

  test("同じ id のウィジェットは誤り。差し替えは overrides の widgets で、置けるスロットは変わらない", () => {
    const twice = definePluginUi(definePlugin({ id: "w" }), {
      widgets: [defineWidget({ id: "w/ping", slots: ["app"], view: Ping })],
    })
    expect(() => assembleUi([...BUILTIN_UI, twice, twice])).toThrow("E001")
    const Tabs = () => <p>my tabs</p>
    const replace = definePluginUi(definePlugin({ id: "w" }), { overrides: { widgets: { "page-tabs": Tabs } } })
    const replaced = assembleUi([...BUILTIN_UI, replace]).widgets.get("page-tabs")
    expect(replaced?.view).toBe(Tabs)
    expect(replaced?.slots).toEqual(ui.widgets.get("page-tabs")?.slots)
  })
})

test("右クリックのメニューの区切り線は、先頭・末尾・続けてのものを消す", () => {
  expect(tidySeparators(["-", "a", "-", "-", "b", "-"])).toEqual(["a", "-", "b"])
  expect(tidySeparators(["-", "-"])).toEqual([])
})
