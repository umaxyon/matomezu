import { describe, expect, test } from "bun:test"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { screenOf } from "../../web/src/core/window"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { isActive, isShown, screenCommandContext } from "../../web/src/store/commands"
import { screensOf, updatePluginStateAtOf } from "../../web/src/store/commands/def"
import { pluginKit } from "../../web/src/store/kit"
import { definePlugin } from "../../web/src/store/plugin"
import { createMatomezuInstance } from "../../web/src/store/store"
import { SAMPLE_BOOKS } from "../sample-books"
import { newStore, sequence, showFirstBook, shown } from "../support"

describe("コマンドを出すかは、呼んだ場所の様子で決まる", () => {
  test("分割していなければ分割を出し、分割していれば、やめると閉じるを出す", () => {
    const store = newStore()
    const { state, actions } = store
    const shown = () =>
      ["@matomezu/base:stage-split", "@matomezu/base:stage-unsplit", "@matomezu/base:stage-close"].filter(id =>
        isShown(store, state.getState(), "s1", id as never),
      )
    expect(shown()).toEqual(["@matomezu/base:stage-split"])
    actions.command("s1", "@matomezu/base:stage-split")
    expect(shown()).toEqual(["@matomezu/base:stage-unsplit", "@matomezu/base:stage-close"])
  })

  test("ブックを作るのはブックを開いていないステージだけ、ページを作るのはページを足せるブックを開いているときだけ", () => {
    const store = newStore()
    const { state, actions } = store
    expect(isShown(store, state.getState(), "s1", "@matomezu/base:book-new")).toBe(false)
    expect(isShown(store, state.getState(), "s1", "@matomezu/base:page-new")).toBe(true)
    // 分割した右のステージは、ブックを開いていない
    actions.split("s1")
    const right = screenOf(state.getState().window).stages[1]!.id
    expect(isShown(store, state.getState(), right, "@matomezu/base:book-new")).toBe(true)
    expect(isShown(store, state.getState(), right, "@matomezu/base:page-new")).toBe(false)
  })

  test("無いステージからは、ステージから呼ぶコマンドを出さない。スクリーンから呼ぶコマンドは、カレントスクリーンから呼んだ物として出す", () => {
    const store = newStore()
    const { state } = store
    const shown = [...store.catalog.store.commands.values()].filter(c =>
      isShown(store, state.getState(), "nope", c.id as never),
    )
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.every(c => c.from === "screen")).toBe(true)
    expect(shown.map(c => c.id)).toContain("@matomezu/base:settings-open")
  })

  test("スクリーンから呼ぶコマンドの文脈は、呼ばれた場所のスクリーンと、カレントにした順のスクリーンを持ち、ステージとブックは持たない", () => {
    const store = newStore()
    const { state } = store
    const center = state.getState().window.screens.find(s => s.def === "@matomezu/control-center:screen")!.id
    const ctx = screenCommandContext(
      store.catalog.core,
      store.controlCenter,
      state.getState(),
      center,
      "@matomezu/base:settings-open",
    )
    // 呼ばれた場所のスクリーンは id を持たない。開いているスクリーンの並びは、base だけが screensOf で読む
    expect(ctx.screen).toEqual({ def: "@matomezu/control-center:screen", props: {}, stages: false })
    expect("screens" in ctx).toBe(false)
    expect(screensOf(ctx).at(-1)).toMatchObject({ def: "@matomezu/base:book-screen", stages: true })
    expect(screensOf(ctx).some(s => s.id === center)).toBe(true)
    expect("stage" in ctx || "book" in ctx).toBe(false)
    // ステージから呼べば、そのステージを並べているスクリーン
    expect(
      screenCommandContext(
        store.catalog.core,
        store.controlCenter,
        state.getState(),
        "s1",
        "@matomezu/base:settings-open",
      ).screen.stages,
    ).toBe(true)
  })

  test("ダイアログは、ステージからも、ステージを持たないスクリーンからも開ける。開いたスクリーンを閉じると、ダイアログも閉じる", () => {
    const store = newStore()
    const { state, actions } = store
    actions.openDialog("s1", "@matomezu/base:settings")
    expect(state.getState().dialog).toMatchObject({ stage: "s1", screen: "c2" })
    actions.closeDialog()
    actions.openDialog("nope", "@matomezu/base:settings")
    expect(state.getState().dialog).toBeNull()
    const second = actions.openScreenId("@matomezu/control-center:screen", {})
    actions.openDialog(second, "@matomezu/base:settings")
    expect(state.getState().dialog).toMatchObject({ stage: "none", screen: second })
    actions.closeScreen(second)
    expect(state.getState().dialog).toBeNull()
  })
})

describe("コマンドを行う", () => {
  test("出ていないコマンドは行わない", () => {
    const { state, actions } = newStore()
    expect(actions.command("s1", "@matomezu/base:stage-unsplit")).toBe(false)
    expect(actions.command("s1", "@matomezu/base:book-new")).toBe(false)
    expect(state.getState().dialog).toBeNull()
  })

  test("引数のあるコマンドは、その値で行う", () => {
    const { state, actions } = newStore()
    expect(actions.command("s1", "@matomezu/base:settings-set", { "@matomezu/base:lang": "matomezu:en" })).toBe(true)
    expect(actions.command("s1", "@matomezu/base:page-open", "p1")).toBe(true)
    expect(state.getState().lang).toBe("en")
  })

  test("ダイアログのコマンドは、呼んだステージから開いたダイアログにする", () => {
    const { state, actions } = newStore()
    actions.command("s1", "@matomezu/base:stage-split")
    actions.command("s2", "@matomezu/base:book-new")
    expect(state.getState().dialog).toMatchObject({ id: "@matomezu/base:book-new", stage: "s2" })
    actions.closeDialog()
    expect(state.getState().dialog).toBeNull()
  })

  test("開いたステージが閉じたらダイアログも閉じ、ほかのステージが閉じても残る", () => {
    const { state, actions } = newStore()
    actions.command("s1", "@matomezu/base:stage-split")
    actions.command("s2", "@matomezu/base:book-new")
    actions.command("s1", "@matomezu/base:stage-close")
    expect(state.getState().dialog).toMatchObject({ id: "@matomezu/base:book-new", stage: "s2" })
    actions.command("s2", "@matomezu/base:stage-split")
    const added = screenOf(state.getState().window).stages[1]!.id
    actions.command(added, "@matomezu/base:book-new")
    actions.command(added, "@matomezu/base:stage-close")
    expect(state.getState().dialog).toBeNull()
  })

  test("引数の型はコマンドで決まる（型を確かめるだけで、行わない）", () => {
    const { actions } = newStore()
    const typeOnly = () => {
      // @ts-expect-error page-open にはページの id を渡す
      actions.command("s1", "@matomezu/base:page-open")
      // @ts-expect-error stage-split は引数を取らない
      actions.command("s1", "@matomezu/base:stage-split", "x")
      // @ts-expect-error 表に無いコマンド
      actions.command("s1", "stage.nope")
    }
    expect(typeOnly).toBeFunction()
  })
})

describe("コマンドは、自分のプラグインのプラグイン状態を文脈 pluginState で読み、run が受け取る updatePluginState で変える", () => {
  const kit = pluginKit("@x/pane", defineMessages({ toggle: { en: "Toggle", ja: "切り替え" } }))
  const MODE = kit.definePluginStateOf<"split" | "hidden">()({ id: "mode", scope: "stage" })
  const FLIPPED = kit.definePluginStateOf<"on">()({ id: "flipped", scope: "window" })
  const TOGGLE = kit.defineCommand({
    id: "toggle",
    title: "toggle",
    run: (_, a) => a.updatePluginState(MODE, now => (now === "split" ? undefined : "split")),
    when: ctx => ctx.pluginState(MODE) !== "hidden",
    active: ctx => ctx.pluginState(MODE) === "split",
  })
  // 2 つの値を 1 回のコマンドで書く
  const BOTH = kit.defineCommand({
    id: "both",
    title: "toggle",
    run: (_, a) => {
      a.updatePluginState(MODE, () => "split")
      a.updatePluginState(FLIPPED, now => (now === "on" ? undefined : "on"))
    },
    when: () => true,
  })
  const make = (plugin = kit.plugin({ pluginStates: [MODE, FLIPPED], commands: [TOGGLE, BOTH] })) =>
    shown(
      createMatomezuInstance({
        plugins: [...BUILTIN, definePlugin(plugin)],
        controlCenter: BUILTIN_CONTROL_CENTER,
        books: SAMPLE_BOOKS,
        lang: "ja",
        newId: sequence(),
      }),
    )
  // 表に無い id（型に書き足していない追加プラグインのコマンド）を呼ぶ
  const call = (store: { readonly actions: { readonly command: unknown } }, stage: string, id: string) =>
    (store.actions.command as (stage: string, id: string) => boolean)(stage, `@x/pane:${id}`)

  test("run で置いた値を、そのステージの when・active が読む。ほかのステージには効かない", () => {
    const store = make()
    const { state } = store
    store.actions.split("s1")
    call(store, "s1", "toggle")
    expect(state.getState().pluginValues.stages).toEqual({ s1: { "@x/pane:mode": "split" } })
    expect(isActive(store, state.getState(), "s1", "@x/pane:toggle" as never)).toBe(true)
    expect(isActive(store, state.getState(), "s2", "@x/pane:toggle" as never)).toBe(false)
    call(store, "s1", "toggle")
    expect(state.getState().pluginValues.stages.s1).toEqual({})
  })

  test("ステージに結ばない宣言（scope が window）の値は、ステージによらない", () => {
    const store = make()
    store.actions.split("s1")
    call(store, "s1", "both")
    expect(store.state.getState().pluginValues.window).toEqual({ "@x/pane:flipped": "on" })
    call(store, "s2", "both")
    expect(store.state.getState().pluginValues.window).toEqual({})
  })

  test("1 回のコマンドで何度書いても、store には 1 回で書く（途中の状態を知らせない）", () => {
    const store = make()
    let notified = 0
    store.state.subscribe(() => {
      notified++
    })
    call(store, "s1", "both")
    expect(notified).toBe(1)
    expect(store.state.getState().pluginValues.stages.s1).toEqual({ "@x/pane:mode": "split" })
    expect(store.state.getState().pluginValues.window).toEqual({ "@x/pane:flipped": "on" })
  })

  test("ほかのスクリーンに書く操作（updatePluginStateAtOf）は、スクリーンごとの宣言だけを受ける（ステージ・窓の範囲の宣言は E124）", () => {
    const PANE = kit.definePluginStateOf<"open">()({ id: "pane", scope: "screen" })
    let target = ""
    const AT = (name: string, def: typeof MODE | typeof FLIPPED | typeof PANE) =>
      kit.defineCommand({
        id: `at-${name}`,
        title: "toggle",
        run: (_, a) => updatePluginStateAtOf(a)(target, def as typeof PANE, () => "open"),
        when: () => true,
      })
    const plugin = kit.plugin({
      pluginStates: [MODE, FLIPPED, PANE],
      commands: [AT("mode", MODE), AT("flipped", FLIPPED), AT("pane", PANE)],
    })
    const store = shown(
      createMatomezuInstance({
        plugins: [...BUILTIN, definePlugin(plugin)],
        controlCenter: BUILTIN_CONTROL_CENTER,
        books: SAMPLE_BOOKS,
        lang: "ja",
        newId: sequence(),
      }),
    )
    target = store.actions.openScreenId("@matomezu/control-center:screen", {})
    call(store, "s1", "at-pane")
    expect(store.state.getState().pluginValues.screens).toEqual({ [target]: { "@x/pane:pane": "open" } })
    expect(() => call(store, "s1", "at-mode")).toThrow("E124")
    expect(() => call(store, "s1", "at-flipped")).toThrow("E124")
  })

  test("読むのは自分の宣言だけ（ほかのプラグインの宣言を読む・書くと E125）", () => {
    const other = pluginKit("@x/other", defineMessages({ steal: { en: "Steal", ja: "盗む" } }))
    const STEAL = other.defineCommand({
      id: "steal",
      title: "steal",
      run: (_, a) => a.updatePluginState(MODE, () => "hidden"),
      when: () => true,
    })
    const store = createMatomezuInstance({
      plugins: [
        ...BUILTIN,
        definePlugin(kit.plugin({ pluginStates: [MODE, FLIPPED], commands: [TOGGLE, BOTH] })),
        definePlugin(other.plugin({ commands: [STEAL] })),
      ],
      controlCenter: BUILTIN_CONTROL_CENTER,
      books: SAMPLE_BOOKS,
      lang: "ja",
      newId: sequence(),
    })
    showFirstBook(store)
    expect(() => (store.actions.command as (stage: string, id: string) => boolean)("s1", "@x/other:steal")).toThrow(
      "E125",
    )
  })
})
