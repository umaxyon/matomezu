// 窓の状態（core/window.ts）: コントロールセンターかブックスクリーンを前に出す。前に出す物を替えても、ブックスクリーンの中は残る。
// コントロールセンターを前に出している間、後ろのブックスクリーンは見えていない物として扱い、キーも届かない

import { expect, test } from "bun:test"
import { z } from "zod"
import type { MatomezuError } from "../../web/src/core/errors"
import { defineMessages } from "../../web/src/core/i18n/messages"
import {
  closeScreen,
  currentScreen,
  makeCurrent,
  newWindow,
  openScreen,
  recentBookScreen,
  screenOf,
  shownBookScreens,
  shownScreens,
  stageIn,
  viewFrontOf,
} from "../../web/src/core/window"
import { showIn, viewOf } from "../../web/src/host-client/server"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { isActive } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { NO_STAGE } from "../../web/src/store/dialogs"
import { pluginKit } from "../../web/src/store/kit"
import { SAMPLE_BOOKS } from "../sample-books"
import { CORE_CATALOG, newStore, sequence, showBooks, showCenter, shown, worldRows } from "../support"

const CENTER = "@matomezu/base:control-center-toggle"

test("ステージの番号は窓で振り、閉じたステージの番号も使い回さない", () => {
  const { actions, state } = newStore()
  actions.split("s1")
  actions.closeStage("s1")
  actions.split("s2")
  expect(screenOf(state.getState().window).stages.map(s => s.id)).toEqual(["s2", "s3"])
  expect(state.getState().window.issued).toBe(3)
})

test("splitStage は足したステージの id を返し、もう足せなければ NO_STAGE", () => {
  const { actions } = newStore()
  expect(actions.splitStage("s1")).toBe("s2")
  expect(actions.splitStage("s1")).toBe(NO_STAGE)
  expect(actions.splitStage("no-such")).toBe(NO_STAGE)
})

// ブックスクリーンを 1 枚（何も開かないステージ s1）開いた窓（c1 がコントロールセンター、c2 がブックスクリーン）
const withBookScreen = () => openScreen(newWindow(CORE_CATALOG), CORE_CATALOG, "@matomezu/base:book-screen", {}).win

test("窓は、最初から開いているスクリーンだけで始まる（ブックスクリーンは 0 枚）", () => {
  const win = newWindow(CORE_CATALOG)
  expect(win.screens.map(s => s.def)).toEqual(["@matomezu/control-center:screen"])
  expect(viewFrontOf(win)).toBe("control-center")
  expect(recentBookScreen(win)).toBeUndefined()
  const opened = withBookScreen()
  expect(viewFrontOf(opened)).toBe("book-screen")
  expect(currentScreen(opened)).toMatchObject({ id: "c2", stages: { current: "s1" } })
})

test("スクリーンを開くと前に出て、閉じると 1 つ前に出していた物が前に出る。同じ定義から何枚でも開け、id は使い回さない", () => {
  let win = withBookScreen()
  win = makeCurrent(win, "c1")
  const first = openScreen(win, CORE_CATALOG, "@matomezu/control-center:screen", {})
  const second = openScreen(first.win, CORE_CATALOG, "@matomezu/control-center:screen", {})
  expect([first.id, second.id]).toEqual(["c3", "c4"])
  expect(currentScreen(second.win).id).toBe("c4")
  win = closeScreen(second.win, CORE_CATALOG, "c4")
  expect(currentScreen(win).id).toBe("c3")
  win = closeScreen(win, CORE_CATALOG, "c3")
  expect(currentScreen(win).id).toBe("c1")
  expect(openScreen(win, CORE_CATALOG, "@matomezu/control-center:screen", {}).id).toBe("c5")
})

test("最初から開いているスクリーンは閉じない。ブックスクリーンは最後の 1 枚も閉じられる", () => {
  const win = withBookScreen()
  expect(closeScreen(win, CORE_CATALOG, "c1")).toBe(win)
  const none = closeScreen(win, CORE_CATALOG, "c2")
  expect(none.screens.map(s => s.id)).toEqual(["c1"])
  expect(currentScreen(none).id).toBe("c1")
  expect(closeScreen(none, CORE_CATALOG, "c1")).toBe(none)
  const two = openScreen(win, CORE_CATALOG, "@matomezu/base:book-screen", {})
  expect(currentScreen(two.win)).toMatchObject({ id: "c3", stages: { current: "s2" } })
  expect(closeScreen(two.win, CORE_CATALOG, "c2").screens.map(s => s.id)).toEqual(["c1", "c3"])
})

test("コントロールセンターを前に出しても、ブックスクリーンの中（ステージ・倍率）は残る。戻すと同じ", () => {
  const { actions, state } = newStore()
  actions.zoomStage("s1", 2)
  const before = screenOf(state.getState().window)
  showCenter({ state, actions })
  expect(viewFrontOf(state.getState().window)).toBe("control-center")
  expect(screenOf(state.getState().window)).toBe(before)
  showBooks({ state, actions })
  expect(viewFrontOf(state.getState().window)).toBe("book-screen")
  expect(screenOf(state.getState().window)).toBe(before)
})

test("巣箱のコマンドは、コントロールセンターを前に出し、前に出している間は押すとブックスクリーンへ戻る。前に出している間は押された状態", () => {
  const { actions, state, ...instance } = newStore()
  const active = () => isActive(instance as never, state.getState(), "s1", CENTER)
  expect(active()).toBe(false)
  expect(actions.command("s1", CENTER)).toBe(true)
  expect(viewFrontOf(state.getState().window)).toBe("control-center")
  expect(active()).toBe(true)
  expect(actions.command("s1", CENTER)).toBe(true)
  expect(viewFrontOf(state.getState().window)).toBe("book-screen")
  expect(active()).toBe(false)
})

test("ブックを開くと、ブックスクリーンを前に出す", () => {
  const { actions, state } = newStore()
  showCenter({ state, actions })
  actions.openBook("s1", "b2")
  expect(viewFrontOf(state.getState().window)).toBe("book-screen")
  expect(screenOf(state.getState().window).stages[0]?.opened?.book).toBe("b2")
})

test("コントロールセンターを前に出している間は、ステージの範囲のキーが効かず、後ろのステージは変わらない", () => {
  const { actions, state } = newStore()
  actions.resizeStage("s1", { w: 800, h: 600 })
  actions.zoomStage("s1", 2)
  // Home はステージの範囲のキー（倍率を開いたときに戻す）
  showCenter({ state, actions })
  expect(actions.pressKey("Home")).toBe(false)
  expect(screenOf(state.getState().window).stages[0]?.zoom).toBe(2)
  showBooks({ state, actions })
  expect(actions.pressKey("Home")).toBe(true)
  expect(screenOf(state.getState().window).stages[0]?.zoom).toBe(1)
})

test("コントロールセンターを前に出している間は、後ろのブックスクリーンの変更は見えていない。戻したら見えたとして、画面の履歴に入る", () => {
  const store = newStore({ now: sequence() })
  const book = store.state.getState().books.b1 as never as { title: string; id: string }
  store.receive({ ...worldRows([book]), settings: {} }, [])
  showCenter(store)
  store.receive({ ...worldRows([{ ...book, title: "AI" }]), settings: {} }, [], {
    books: ["b1"],
    by: "ai",
    act: "1",
    actions: ["@matomezu/base:book-update"],
  })
  expect(store.state.getState().history.b1).toBeUndefined()
  showBooks(store)
  expect(store.state.getState().history.b1?.undo.map(s => s.by)).toEqual(["ai"])
})

test("AI に知らせる見ているもの: ブックスクリーンを前に出している間は book など、コントロールセンターを前に出している間は front と hidden に分ける", () => {
  const { actions, state } = newStore()
  expect(viewOf(CORE_CATALOG, state.getState())).toMatchObject({
    front: "book-screen",
    book: "b1",
    page: "p1",
    stage: "s1",
  })
  showCenter({ state, actions })
  const view = viewOf(CORE_CATALOG, state.getState())
  expect(view).toMatchObject({ front: "control-center", hidden: { book: "b1", page: "p1", stage: "s1" } })
  expect("book" in view).toBe(false)
})

test("AI の show は、ブックを渡すとブックスクリーンを前に出す（コントロールセンターを前に出していても）", () => {
  const store = newStore()
  showCenter(store)
  showIn(store, { book: "b2" })
  expect(viewFrontOf(store.state.getState().window)).toBe("book-screen")
  expect(screenOf(store.state.getState().window).stages[0]?.opened?.book).toBe("b2")
})

test("store の openScreen は、定義の渡す値の形に合えば開いて前に出し、合わない値と無い定義は開かない。closeScreen で閉じると前の物に戻る", () => {
  const { actions, state } = newStore()
  const before = currentScreen(state.getState().window).id
  expect(actions.openScreenId("@ex/none:x", {})).toBe("refused")
  expect(actions.openScreenId("@matomezu/control-center:screen", { extra: 1 })).toBe("refused")
  const id = actions.openScreenId("@matomezu/control-center:screen", {})
  expect(currentScreen(state.getState().window)).toMatchObject({ id, def: "@matomezu/control-center:screen" })
  actions.makeScreenCurrent(before)
  expect(currentScreen(state.getState().window).id).toBe(before)
  actions.makeScreenCurrent(id)
  actions.closeScreen(id)
  expect(currentScreen(state.getState().window).id).toBe(before)
  expect(state.getState().window.screens.some(s => s.id === id)).toBe(false)
})

test("プラグインに渡す openScreen は開けたかだけを返す。closeScreen と setScreenProps は、ステージの id を受ければ、そのステージを並べるスクリーンに向く", () => {
  const { actions, state } = newStore()
  expect(actions.openScreen("@matomezu/control-center:screen", { extra: 1 })).toBe(false)
  expect(actions.openScreen("@matomezu/base:book-screen", {})).toBe(true)
  const second = currentScreen(state.getState().window)
  const stage = second.stages!.current
  expect(actions.setScreenProps(stage, { extra: 1 })).toBe(false)
  expect(actions.setScreenProps(stage, {})).toBe(true)
  expect(actions.setScreenProps("nope", {})).toBe(false)
  actions.closeScreen(stage)
  expect(state.getState().window.screens.some(s => s.id === second.id)).toBe(false)
  // どのスクリーンでもステージでもない所は、何も閉じない
  const count = state.getState().window.screens.length
  actions.closeScreen("nope")
  expect(state.getState().window.screens).toHaveLength(count)
})

test("2 枚目のブックスクリーンのステージにも、ステージの操作が届く（大きさ・ずらす・倍率・フォーカス・ブックを開く・分割）", () => {
  const { actions, state } = newStore()
  const second = actions.openScreenId("@matomezu/base:book-screen", {})
  const stageOf = () => state.getState().window.screens.find(s => s.id === second)!.stages!
  const stage = stageOf().current
  expect(stage).not.toBe("s1")
  actions.resizeStage(stage, { w: 800, h: 600 })
  expect(stageOf().stages[0]!.view).toEqual({ w: 800, h: 600 })
  actions.openBook(stage, "b2")
  expect(stageOf().stages[0]!.opened?.book).toBe("b2")
  actions.zoomStage(stage, 2)
  expect(stageOf().stages[0]!.zoom).toBe(2)
  actions.select(stage, ["x"])
  actions.split(stage)
  expect(stageOf().stages).toHaveLength(2)
  const right = stageOf().stages[1]!.id
  actions.focusStage(right)
  expect(stageOf().current).toBe(right)
  actions.closeStage(right)
  expect(stageOf().stages.map(s => s.id)).toEqual([stage])
  // 1 枚目のブックスクリーンは変わらない（ステージ s1 は b1 を開いたまま）
  expect(stageIn(state.getState().window, "s1")?.opened?.book).toBe("b1")
  expect(stageIn(state.getState().window, "s1")?.zoom).toBe(1)
})

// 開いているスクリーンを全部見せるスクリーンアレンジメントを足したインスタンス
function withAllShown(atStart = false) {
  const kit = pluginKit("k", defineMessages({ All: { en: "All", ja: "全部" } }))
  const ALL = kit.defineScreenArrangement({
    id: "all",
    title: "All",
    aiDescription: "Shows every opened screen.",
    shown: screens => screens.map(s => s.id),
    ...(atStart ? { atStart: true as const } : {}),
  })
  return shown(
    createMatomezu({
      plugins: [...BUILTIN, kit.plugin({ screenArrangements: [ALL] })],
      controlCenter: BUILTIN_CONTROL_CENTER,
      books: SAMPLE_BOOKS,
      lang: "ja",
      partial: true,
    }),
  )
}

test("見えているスクリーンは、スクリーンアレンジメントが答える。「1 枚ずつ」ではカレントスクリーンだけで、替えると見え方が変わる", () => {
  const instance = withAllShown()
  const { actions, state } = instance
  const core = instance.catalog.core
  const win = () => state.getState().window
  expect(win().arrangement).toBe("@matomezu/base:one-screen")
  expect(shownScreens(core, win())).toEqual([currentScreen(win()).id])
  showCenter({ state, actions })
  expect(shownBookScreens(core, win())).toEqual([])
  // 全部を見せるアレンジメントに替えると、カレントでないブックスクリーンも見えている
  actions.setScreenArrangement("k:all")
  expect(win().arrangement).toBe("k:all")
  expect(shownScreens(core, win())).toEqual(win().screens.map(s => s.id))
  expect(shownBookScreens(core, win()).map(s => s.def)).toEqual(["@matomezu/base:book-screen"])
  expect(viewFrontOf(win())).toBe("control-center")
  // 見えているブックスクリーンは、AI に見えている物として知らせる（カレントスクリーンの種類は変わらない）
  expect(viewOf(core, state.getState())).toMatchObject({ front: "control-center", book: "b1" })
  // 機能台帳に無いアレンジメントには替えない。場所に入り、当てはめると戻る
  actions.setScreenArrangement("k:none")
  expect(win().arrangement).toBe("k:all")
  const at = instance.address()
  expect(at.arrangement).toBe("k:all")
  actions.setScreenArrangement("@matomezu/base:one-screen")
  instance.locate(at)
  expect(win().arrangement).toBe("k:all")
  instance.locate({ ...at, arrangement: "k:none" })
  expect(win().arrangement).toBe("k:all")
})

test("窓を開いたときのスクリーンアレンジメントを 2 つが名乗ると、台帳アセンブルの error（E054）", () => {
  let codes: string[] = []
  try {
    withAllShown(true)
  } catch (e) {
    codes = (e as MatomezuError).details.map(p => p.code)
  }
  expect(codes).toContain("E054")
})

test("ステージを並べるスクリーンの定義を 2 つが名乗ると、台帳アセンブルの error（E055）", () => {
  const kit = pluginKit("k", defineMessages({ Other: { en: "Other", ja: "ほか" } }))
  const OTHER = kit.defineScreen({
    id: "other",
    title: "Other",
    aiDescription: "Another screen that lines stages up.",
    props: z.strictObject({}),
    stages: true,
  })
  let codes: string[] = []
  try {
    createMatomezu({
      plugins: [...BUILTIN, kit.plugin({ screens: [OTHER] })],
      controlCenter: BUILTIN_CONTROL_CENTER,
      books: SAMPLE_BOOKS,
      lang: "ja",
      partial: true,
    })
  } catch (e) {
    codes = (e as MatomezuError).details.map(p => p.code)
  }
  expect(codes).toContain("E055")
})

// ブックスクリーンの id と、そのステージが開いているブックの id の並び（開いた順）
const bookScreens = (store: ReturnType<typeof newStore>) =>
  store.state
    .getState()
    .window.screens.filter(s => s.stages)
    .map(s => ({ id: s.id, books: s.stages?.stages.map(st => st.opened?.book ?? null) }))

test("宛先なしで作った窓は、ブックスクリーンが 0 枚。AI の view は bookScreen が none で、キーを押しても落ちない", () => {
  const store = createMatomezu({
    plugins: BUILTIN,
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
  })
  const { state } = store
  expect(state.getState().window.screens.map(s => s.def)).toEqual(["@matomezu/control-center:screen"])
  expect(viewOf(store.catalog.core, state.getState())).toEqual({ front: "control-center", bookScreen: "none" })
  expect(store.actions.pressKey("Home")).toBe(false)
})

test("showBook は、新しいブックスクリーンで開き、もう開いているブックはそのスクリーンを前に出すだけ。無いブックは false", () => {
  const store = newStore({ bookScreen: "none" })
  expect(store.actions.showBook("b1")).toBe(true)
  expect(store.actions.showBook("b2")).toBe(true)
  expect(bookScreens(store)).toEqual([
    { id: "c2", books: ["b1"] },
    { id: "c3", books: ["b2"] },
  ])
  expect(currentScreen(store.state.getState().window).id).toBe("c3")
  expect(store.actions.showBook("b1")).toBe(true)
  expect(bookScreens(store).map(s => s.id)).toEqual(["c2", "c3"])
  expect(currentScreen(store.state.getState().window).id).toBe("c2")
  expect(store.actions.showBook("nope")).toBe(false)
})

test("ブックスクリーンは 2 枚まで: 3 枚目を開くと、カレントにしたのが古い 1 枚を閉じる", () => {
  const store = newStore({ bookScreen: "none" })
  store.actions.showBook("b1")
  store.actions.showBook("b2")
  store.actions.showBook("b1") // b1 を前に出したので、古いのは b2
  store.actions.showBook("b3")
  expect(bookScreens(store)).toEqual([
    { id: "c2", books: ["b1"] },
    { id: "c4", books: ["b3"] },
  ])
  // プラグインがスクリーンを開く道（openScreen）も、同じ上限を通る
  store.actions.openScreen("@matomezu/base:book-screen", {})
  expect(bookScreens(store).map(s => s.id)).toEqual(["c4", "c5"])
})

test("AI の show は、ステージも split も言わなければ窓に出す（showBook）。0 枚からでも出せる", () => {
  const store = newStore({ bookScreen: "none" })
  showIn(store, { book: "b2" })
  expect(bookScreens(store)).toEqual([{ id: "c2", books: ["b2"] }])
  showIn(store, { book: "b1" })
  expect(bookScreens(store).map(s => s.books)).toEqual([["b2"], ["b1"]])
  // ステージを言えば、そのステージで差し替える
  const stage = screenOf(store.state.getState().window).current
  showIn(store, { book: "b3", stage })
  expect(bookScreens(store).map(s => s.books)).toEqual([["b2"], ["b3"]])
})

test("場所を当てはめても、ブックスクリーンは 2 枚まで。ブックスクリーンの無い場所は、今の 1 枚を後ろに残す", () => {
  const store = newStore({ bookScreen: "none" })
  const none = store.address()
  store.actions.showBook("b1")
  const one = store.address()
  store.actions.showBook("b2")
  const two = store.address()
  // 手で書いた場所に 3 枚あれば、カレントにしたのが古い物を閉じる
  const third = { ...(two.screens[2] as (typeof two.screens)[number]), id: "c9" }
  store.locate({ ...two, screens: [...two.screens, third], order: [...two.order, "c9"] })
  expect(bookScreens(store).map(s => s.id)).toEqual(["c3", "c9"])
  // ブラウザの戻るで、ブックスクリーンの無い場所へ: 1 枚を後ろに残し、コントロールセンターが前
  store.locate(one)
  store.locate(none)
  expect(bookScreens(store).length).toBe(1)
  expect(viewFrontOf(store.state.getState().window)).toBe("control-center")
})

test("2 枚のブックスクリーンから、ブックスクリーンの無い場所へ戻ると、いちばん最近カレントにした 1 枚が残る", () => {
  const store = newStore({ bookScreen: "none" })
  const none = store.address()
  store.actions.showBook("b1")
  store.actions.showBook("b2")
  // 先に開いた b1 を前に出してから戻る: 残るのは b1 のスクリーン
  store.actions.showBook("b1")
  store.locate(none)
  expect(bookScreens(store).map(s => s.books)).toEqual([["b1"]])
})
