import { afterEach, describe, expect, test } from "bun:test"
import { cleanup, render, screen, within } from "@testing-library/react"
import { isMatomezuError, problemText } from "../../web/src/core/errors"
import { defineWorkspace, STAGE_BASE_SLOTS } from "../../web/src/plugins/base/ui"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { defineCommand } from "../../web/src/store/commands/def"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import {
  checkLayout,
  defineLayout,
  defineWidget,
  type LayoutDef,
  placeAdded,
  skipAbsent,
  tidySeparators,
} from "../../web/src/ui/layout"
import { assembleUi, definePluginUi } from "../../web/src/ui/plugin"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider, shownLayout } from "../../web/src/ui/store-context"

afterEach(cleanup)

const instance = () =>
  createMatomezu({ plugins: BUILTIN_UI, home: "@matomezu/master:master", books: SAMPLE_BOOKS, lang: "ja" })
const ui = assembleUi(BUILTIN_UI)
const commands = new Set(instance().catalog.store.commands.keys())

// タブを上の行に移した配置
const TABS_ON_TOP = defineLayout({
  ...DEFAULT_LAYOUT,
  id: "tabs-on-top",
  slots: {
    ...DEFAULT_LAYOUT.slots,
    "@matomezu/base:stage-top": ["@matomezu/base:toolbox", "@matomezu/base:page-tabs"],
    "@matomezu/base:stage-bottom": ["@matomezu/base:book-name"],
  },
})

describe("配置", () => {
  test("既定の配置には食い違いが無い", () => {
    expect(checkLayout(DEFAULT_LAYOUT, ui, commands)).toEqual([])
  })

  test("知らないウィジェット・置けないスロット・インスタンスに無いコマンドは誤り", () => {
    const bad = {
      id: "bad",
      slots: {
        root: ["@matomezu/base:workspace"],
        "@matomezu/base:stage-top": ["nope", "@matomezu/base:book-view"],
        "@matomezu/base:stage-bottom": ["@matomezu/base:book-name"],
      },
      menus: { "@matomezu/base:stage-menu": [{ either: ["@matomezu/base:stage-split", "stage.nope"] }] },
    } as unknown as LayoutDef
    expect(checkLayout(bad, ui, commands).map(problemText)).toEqual([
      "E207 layout bad: slot @matomezu/base:stage-top has unknown widget nope",
      "E208 layout bad: widget @matomezu/base:book-view cannot be placed in slot @matomezu/base:stage-top",
      "E209 layout bad: menu @matomezu/base:stage-menu has unknown command stage.nope",
    ])
  })

  test("中身を書いたのに、置いたウィジェットのどれも開けないスロットとメニューは誤り", () => {
    // 根にステージの骨組みが無いので、ステージのスロットもメニューも画面に出ない
    const noStages = defineLayout({
      ...DEFAULT_LAYOUT,
      id: "no-stages",
      slots: { ...DEFAULT_LAYOUT.slots, root: ["@matomezu/base:dialog-host"] },
    })
    expect(checkLayout(noStages, ui, commands).map(problemText)).toEqual([
      "E211 layout no-stages: slot @matomezu/base:stage-top is not opened by any placed widget",
      "E211 layout no-stages: slot @matomezu/base:stage-body is not opened by any placed widget",
      "E211 layout no-stages: slot @matomezu/base:stage-bottom is not opened by any placed widget",
      "E211 layout no-stages: slot @matomezu/base:stage-corner is not opened by any placed widget",
      "E212 layout no-stages: menu @matomezu/base:stage-menu is not shown by any placed widget",
    ])
    // 中身を書かなければ、ステージの無い画面にできる
    const bare = defineLayout({ id: "bare", slots: { root: ["@matomezu/base:dialog-host"] }, menus: {} })
    expect(checkLayout(bare, ui, commands)).toEqual([])
  })

  test("ステージの骨組みは defineWorkspace で差し替えられる（ベーススロットを全部開ける）", () => {
    const MyWorkspace = () => <p>my workspace</p>
    const MY_WORKSPACE = defineWorkspace({ id: "w:workspace", view: MyWorkspace })
    expect(MY_WORKSPACE.opens).toEqual(STAGE_BASE_SLOTS)
    const mine = definePluginUi(definePlugin({ id: "w" }), { widgets: [MY_WORKSPACE] })
    const widgets = assembleUi([...BUILTIN_UI, mine]).widgets
    const layout = {
      ...DEFAULT_LAYOUT,
      id: "mine",
      slots: { ...DEFAULT_LAYOUT.slots, root: ["w:workspace", "@matomezu/base:dialog-host"] },
    }
    expect(checkLayout(layout as unknown as LayoutDef, { ...ui, widgets }, commands)).toEqual([])
  })

  test("右クリックのメニューのインスタンスに無いコマンドと、どのコンポーネントも開かないメニューは誤り", () => {
    const bad = {
      ...DEFAULT_LAYOUT,
      id: "bad",
      contextMenus: {
        "@matomezu/paper:paper-context": ["drawing.nope"],
        "other.context": ["@matomezu/base:stage-home"],
      },
    } as unknown as LayoutDef
    expect(checkLayout(bad, ui, commands).map(problemText)).toEqual([
      "E209 layout bad: menu @matomezu/paper:paper-context has unknown command drawing.nope",
      "E213 layout bad: context menu other.context is not opened by any placed widget or book view",
    ])
  })

  test("右クリックのメニューに置けるのは、引数の無いコマンドと受け取る物を引数に取れるコマンドだけ", () => {
    defineLayout({
      ...DEFAULT_LAYOUT,
      id: "typed",
      // @ts-expect-error page-open はページの id を受け取るが、図面のメニューは何も渡さない
      contextMenus: { "@matomezu/paper:paper-context": ["@matomezu/base:book-settings", "@matomezu/base:page-open"] },
    })
  })

  test("食い違いのある配置は、画面に置くときに誤り", () => {
    const bad = { id: "bad", slots: { root: ["nope"] }, menus: {} } as unknown as LayoutDef
    let thrown: unknown
    try {
      render(
        <MatomezuProvider instance={instance()} layout={bad}>
          <Screen />
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
      defineLayout({ id: "x", slots: { "@matomezu/base:stage-top": ["@matomezu/base:book-view"] }, menus: {} })
      // @ts-expect-error 知らないウィジェット
      defineLayout({ id: "x", slots: { "@matomezu/base:stage-top": ["nope"] }, menus: {} })
      // @ts-expect-error page-open はページの id を取るので、メニューに置けない
      defineLayout({ id: "x", slots: {}, menus: { "@matomezu/base:stage-menu": ["@matomezu/base:page-open"] } })
    }
    expect(typeOnly).toBeFunction()
  })

  test("配置を替えると、その場で組み直す（タブを上の行へ）", () => {
    const a = instance()
    const { rerender } = render(
      <MatomezuProvider instance={a} layout={DEFAULT_LAYOUT}>
        <Screen />
      </MatomezuProvider>,
    )
    const toolbar = () => screen.getByRole("toolbar", { name: "ツール" }).parentElement!
    expect(within(toolbar()).queryByRole("tablist")).toBeNull()
    rerender(
      <MatomezuProvider instance={a} layout={TABS_ON_TOP}>
        <Screen />
      </MatomezuProvider>,
    )
    expect(within(toolbar()).getByRole("tablist")).toBeTruthy()
  })
})

describe("ウィジェット", () => {
  const Ping = () => <p>ping</p>

  test("プラグインのウィジェットは、頭にプラグインの id と : を付ける", () => {
    const bad = definePluginUi(definePlugin({ id: "w" }), {
      widgets: [defineWidget({ id: "ping", slots: ["root"], view: Ping })],
    })
    expect(() => assembleUi([...BUILTIN_UI, bad])).toThrow("E301")
  })

  test("同じ id のウィジェットは誤り。差し替えは overrides の widgets で、置けるスロットは変わらない", () => {
    const twice = definePluginUi(definePlugin({ id: "w" }), {
      widgets: [defineWidget({ id: "w:ping", slots: ["root"], view: Ping })],
    })
    expect(() => assembleUi([...BUILTIN_UI, twice, twice])).toThrow("E001")
    const Tabs = () => <p>my tabs</p>
    const replace = definePluginUi(definePlugin({ id: "w" }), {
      overrides: { widgets: { "@matomezu/base:page-tabs": Tabs } },
    })
    const replaced = assembleUi([...BUILTIN_UI, replace]).widgets.get("@matomezu/base:page-tabs")
    expect(replaced?.view).toBe(Tabs)
    expect(replaced?.slots).toEqual(ui.widgets.get("@matomezu/base:page-tabs")?.slots)
  })
})

test("右クリックのメニューの区切り線は、先頭・末尾・続けてのものを消す", () => {
  expect(tidySeparators(["-", "a", "-", "-", "b", "-"])).toEqual(["a", "-", "b"])
  expect(tidySeparators(["-", "-"])).toEqual([])
})

describe("取り込んだプラグインの置き場所", () => {
  const Ping = () => <p>ping</p>
  const open = defineCommand({
    id: "p:open",
    title: "Open" as never,
    run: () => {},
    when: () => true,
    place: { menus: ["@matomezu/base:stage-menu"] },
  })
  const edit = defineCommand({
    id: "p:edit",
    title: "Edit" as never,
    run: () => {},
    when: () => true,
    place: { contextMenus: ["@matomezu/paper:item-context", "@matomezu/paper:paper-context"] },
  })
  const added = definePluginUi(definePlugin({ id: "p", commands: [open, edit] }), {
    widgets: [
      defineWidget({
        id: "p:ping",
        slots: ["@matomezu/base:stage-top", "@matomezu/base:stage-bottom"],
        place: "@matomezu/base:stage-bottom",
        view: Ping,
      }),
    ],
  })

  test("置いてほしいと書いたウィジェットとコマンドを、既定の配置の末尾に足す。右クリックのメニューは区切り線で分け、もうあるものは足さない", () => {
    const layout = placeAdded(DEFAULT_LAYOUT, [...BUILTIN_UI, added])
    expect(layout.slots["@matomezu/base:stage-bottom"] as readonly unknown[] | undefined).toEqual([
      ...DEFAULT_LAYOUT.slots["@matomezu/base:stage-bottom"],
      "p:ping",
    ])
    expect(layout.slots["@matomezu/base:stage-top"] as readonly unknown[] | undefined).toEqual(
      DEFAULT_LAYOUT.slots["@matomezu/base:stage-top"],
    )
    expect(layout.menus["@matomezu/base:stage-menu"] as readonly unknown[] | undefined).toEqual([
      ...DEFAULT_LAYOUT.menus["@matomezu/base:stage-menu"],
      "p:open",
    ])
    expect(layout.contextMenus?.["@matomezu/paper:item-context"] as readonly unknown[] | undefined).toEqual([
      ...DEFAULT_LAYOUT.contextMenus["@matomezu/paper:item-context"],
      "-",
      "p:edit",
    ])
    expect(layout.contextMenus?.["@matomezu/paper:paper-context"] as readonly unknown[] | undefined).toEqual([
      ...DEFAULT_LAYOUT.contextMenus["@matomezu/paper:paper-context"],
      "-",
      "p:edit",
    ])
    expect(placeAdded(layout, [added])).toEqual(layout)
    const all = assembleUi([...BUILTIN_UI, added])
    const commandsWith = new Set([...commands, "p:open", "p:edit"])
    expect(checkLayout(layout, all, commandsWith)).toEqual([])
  })

  test("置けないスロットと、引数の合わないメニューは型の誤り", () => {
    // @ts-expect-error 置けるスロットに無い
    defineWidget({ id: "p:x", slots: ["@matomezu/base:stage-top"], place: "@matomezu/base:stage-bottom", view: Ping })
    defineCommand({
      id: "p:arg",
      title: "Arg" as never,
      run: (_ctx, _a, _n: number) => {},
      when: () => true,
      // @ts-expect-error 引数を取るコマンドはメニューに入れられない
      place: { menus: ["@matomezu/base:stage-menu"] },
    })
  })
})

describe("組み込まれていないプラグインの物", () => {
  const LINE_CONTEXT = "@matomezu/line:line-context"
  test("持ち主のプラグインが無い物は除いて注意 N010 にし、持ち主がいるのに無い物は今どおり誤り", () => {
    const present = new Set(BUILTIN_UI.filter(ui => ui.id !== "@matomezu/line").map(ui => ui.id))
    const { layout, notices } = skipAbsent(DEFAULT_LAYOUT, present)
    expect(notices.map(n => [n.code, n.plugin, n.params.kind, n.params.id])).toEqual([
      ["N010", "@matomezu/line", "contextMenu", LINE_CONTEXT],
    ])
    expect((layout.contextMenus as Record<string, unknown>)[LINE_CONTEXT]).toBeUndefined()
    // 線があれば何も除かない
    expect(skipAbsent(DEFAULT_LAYOUT, new Set(BUILTIN_UI.map(ui => ui.id))).notices).toEqual([])
    // 持ち主の線はいるのに、無いコマンドを書いた（書き間違い）なら、除かずに誤りのまま
    const typo = {
      ...DEFAULT_LAYOUT,
      contextMenus: { ...DEFAULT_LAYOUT.contextMenus, [LINE_CONTEXT]: ["@matomezu/line:line-edt"] },
    }
    const all = skipAbsent(typo as LayoutDef, new Set(BUILTIN_UI.map(ui => ui.id)))
    expect(all.notices).toEqual([])
    const ui = assembleUi(BUILTIN_UI)
    const commands = new Set(createMatomezu({ plugins: BUILTIN_UI }).catalog.store.commands.keys())
    expect(checkLayout(all.layout, ui, commands).map(p => p.code)).toEqual(["E209"])
  })
})

describe("取り込むときの配置の確かめ", () => {
  const Ping = () => <p>ping</p>
  // どのウィジェットも開かないスロットに置いてほしいと書いたプラグイン（取り込んだあとに描くと E211 で画面が止まる）
  const nowhere = definePluginUi(definePlugin({ id: "q" }), {
    widgets: [defineWidget({ id: "q:ping", slots: ["q:nowhere" as never], place: "q:nowhere" as never, view: Ping })],
  })
  const fine = definePluginUi(definePlugin({ id: "r" }), {
    widgets: [
      defineWidget({
        id: "r:ping",
        slots: ["@matomezu/base:stage-bottom"],
        place: "@matomezu/base:stage-bottom",
        view: Ping,
      }),
    ],
  })

  test("配置が食い違うプラグインは取り込むときに外し、ほかのプラグインで画面を描く", () => {
    const instance = createMatomezu({ plugins: BUILTIN_UI, home: "@matomezu/master:master" })
    const { failed } = instance.use([nowhere, fine], all => {
      shownLayout(placeAdded(DEFAULT_LAYOUT, all), all, assembleUi(all))
    })
    expect(failed.map(f => f.id)).toEqual(["q"])
    expect(instance.plugins.map(p => p.id as string)).toContain("r")
    render(
      <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, instance.plugins)}>
        <Screen />
      </MatomezuProvider>,
    )
    expect(screen.getAllByText("ping").length).toBeGreaterThan(0)
  })
})
