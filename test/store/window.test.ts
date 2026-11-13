// 窓の状態（core/window.ts）: コントロールセンターかブックスクリーンを前に出す。前に出す物を替えても、ブックスクリーンの中は残る。
// コントロールセンターを前に出している間、後ろのブックスクリーンは見えていない物として扱い、キーも届かない
import { expect, test } from "bun:test"
import {
  bringFront,
  closeScreen,
  frontOf,
  frontScreen,
  newWindow,
  openScreen,
  screenOf,
} from "../../web/src/core/window"
import { showIn, viewOf } from "../../web/src/host-client/server"
import { isActive } from "../../web/src/store/commands"
import { CORE_CATALOG, newStore, sequence } from "../support"

const CENTER = "@matomezu/base:control-center-toggle"

test("ステージの番号は窓で振り、閉じたステージの番号も使い回さない", () => {
  const { actions, state } = newStore()
  actions.split("s1")
  actions.closeStage("s1")
  actions.split("s2")
  expect(screenOf(state.getState().window).stages.map(s => s.id)).toEqual(["s2", "s3"])
  expect(state.getState().window.issued).toBe(3)
})

test("窓は、最初から開いているスクリーンと、ブックスクリーン 1 枚で始まり、ブックスクリーンを前に出す", () => {
  const win = newWindow(CORE_CATALOG, null)
  expect(win.screens.map(s => s.def)).toEqual(["@matomezu/control-center:screen", "@matomezu/base:book-screen"])
  expect(frontOf(win)).toBe("book-screen")
  expect(frontScreen(win)).toMatchObject({ id: "c2", stages: { current: "s1" } })
})

test("スクリーンを開くと前に出て、閉じると 1 つ前に出していた物が前に出る。同じ定義から何枚でも開け、id は使い回さない", () => {
  let win = newWindow(CORE_CATALOG, null)
  win = bringFront(win, "c1")
  const first = openScreen(win, CORE_CATALOG, "@matomezu/control-center:screen", {})
  const second = openScreen(first.win, CORE_CATALOG, "@matomezu/control-center:screen", {})
  expect([first.id, second.id]).toEqual(["c3", "c4"])
  expect(frontScreen(second.win).id).toBe("c4")
  win = closeScreen(second.win, CORE_CATALOG, "c4")
  expect(frontScreen(win).id).toBe("c3")
  win = closeScreen(win, CORE_CATALOG, "c3")
  expect(frontScreen(win).id).toBe("c1")
  expect(openScreen(win, CORE_CATALOG, "@matomezu/control-center:screen", {}).id).toBe("c5")
})

test("最初から開いているスクリーンと、最後の 1 枚のブックスクリーンは閉じない", () => {
  const win = newWindow(CORE_CATALOG, null)
  expect(closeScreen(win, CORE_CATALOG, "c1")).toBe(win)
  expect(closeScreen(win, CORE_CATALOG, "c2")).toBe(win)
  const two = openScreen(win, CORE_CATALOG, "@matomezu/base:book-screen", {})
  expect(frontScreen(two.win)).toMatchObject({ id: "c3", stages: { current: "s2" } })
  expect(closeScreen(two.win, CORE_CATALOG, "c2").screens.map(s => s.id)).toEqual(["c1", "c3"])
})

test("コントロールセンターを前に出しても、ブックスクリーンの中（ステージ・倍率）は残る。戻すと同じ", () => {
  const { actions, state } = newStore()
  actions.zoomStage("s1", 2)
  const before = screenOf(state.getState().window)
  actions.showControlCenter()
  expect(frontOf(state.getState().window)).toBe("control-center")
  expect(screenOf(state.getState().window)).toBe(before)
  actions.showBookScreen()
  expect(frontOf(state.getState().window)).toBe("book-screen")
  expect(screenOf(state.getState().window)).toBe(before)
})

test("止まり木のコマンドは、コントロールセンターを前に出し、前に出している間は押すとブックスクリーンへ戻る。前に出している間は押された状態", () => {
  const { actions, state, ...instance } = newStore()
  const active = () => isActive(instance as never, state.getState(), "s1", CENTER)
  expect(active()).toBe(false)
  expect(actions.command("s1", CENTER)).toBe(true)
  expect(frontOf(state.getState().window)).toBe("control-center")
  expect(active()).toBe(true)
  expect(actions.command("s1", CENTER)).toBe(true)
  expect(frontOf(state.getState().window)).toBe("book-screen")
  expect(active()).toBe(false)
})

test("ブックを開くと、ブックスクリーンを前に出す", () => {
  const { actions, state } = newStore()
  actions.showControlCenter()
  actions.openBook("s1", "b2")
  expect(frontOf(state.getState().window)).toBe("book-screen")
  expect(screenOf(state.getState().window).stages[0]?.opened?.book).toBe("b2")
})

test("コントロールセンターを前に出している間は、ステージの範囲のキーが効かず、後ろのステージは変わらない", () => {
  const { actions, state } = newStore()
  actions.resizeStage("s1", { w: 800, h: 600 })
  actions.zoomStage("s1", 2)
  // Home はステージの範囲のキー（倍率を開いたときに戻す）
  actions.showControlCenter()
  expect(actions.pressKey("Home")).toBe(false)
  expect(screenOf(state.getState().window).stages[0]?.zoom).toBe(2)
  actions.showBookScreen()
  expect(actions.pressKey("Home")).toBe(true)
  expect(screenOf(state.getState().window).stages[0]?.zoom).toBe(1)
})

test("コントロールセンターを前に出している間は、後ろのブックスクリーンの変更は見えていない。戻したら見えたとして、画面の履歴に入る", () => {
  const store = newStore({ now: sequence() })
  const book = store.state.getState().books.b1 as never as { title: string; id: string }
  store.receive({ books: [book], settings: {} }, [])
  store.actions.showControlCenter()
  store.receive({ books: [{ ...book, title: "AI" }], settings: {} }, [], {
    book: "b1",
    by: "ai",
    act: "1",
    action: "@matomezu/base:book-update",
  })
  expect(store.state.getState().history.b1).toBeUndefined()
  store.actions.showBookScreen()
  expect(store.state.getState().history.b1?.undo.map(s => s.by)).toEqual(["ai"])
})

test("AI に知らせる見ているもの: ブックスクリーンを前に出している間は book など、コントロールセンターを前に出している間は front と hidden に分ける", () => {
  const { actions, state } = newStore()
  expect(viewOf(state.getState())).toMatchObject({ front: "book-screen", book: "b1", page: "p1", stage: "s1" })
  actions.showControlCenter()
  const view = viewOf(state.getState())
  expect(view).toMatchObject({ front: "control-center", hidden: { book: "b1", page: "p1", stage: "s1" } })
  expect("book" in view).toBe(false)
})

test("AI の show は、ブックを渡すとブックスクリーンを前に出す（コントロールセンターを前に出していても）", () => {
  const store = newStore()
  store.actions.showControlCenter()
  showIn(store, { book: "b2" })
  expect(frontOf(store.state.getState().window)).toBe("book-screen")
  expect(screenOf(store.state.getState().window).stages[0]?.opened?.book).toBe("b2")
})

test("store の openScreen は、定義の渡す値の形に合えば開いて前に出し、合わない値と無い定義は開かない。closeScreen で閉じると前の物に戻る", () => {
  const { actions, state } = newStore()
  const before = frontScreen(state.getState().window).id
  expect(actions.openScreen("@ex/none:x", {})).toBe("refused")
  expect(actions.openScreen("@matomezu/control-center:screen", { extra: 1 })).toBe("refused")
  const id = actions.openScreen("@matomezu/control-center:screen", {})
  expect(frontScreen(state.getState().window)).toMatchObject({ id, def: "@matomezu/control-center:screen" })
  actions.bringScreenFront(before)
  expect(frontScreen(state.getState().window).id).toBe(before)
  actions.bringScreenFront(id)
  actions.closeScreen(id)
  expect(frontScreen(state.getState().window).id).toBe(before)
  expect(state.getState().window.screens.some(s => s.id === id)).toBe(false)
})
