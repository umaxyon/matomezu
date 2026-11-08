// 窓の状態（core/window.ts）: コントロールセンターかブックスクリーンを前に出す。前に出す物を替えても、ブックスクリーンの中は残る。
// コントロールセンターを前に出している間、後ろのブックスクリーンは見えていない物として扱い、キーも届かない
import { expect, test } from "bun:test"
import { newWindow, screenOf } from "../../web/src/core/window"
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

test("ブックスクリーンは並びで持ち、前に出せるのは 1 つ", () => {
  const win = newWindow(CORE_CATALOG, null)
  expect(win).toMatchObject({ front: "book-screen", screen: 0 })
  expect(win.screens).toHaveLength(1)
})

test("コントロールセンターを前に出しても、ブックスクリーンの中（ステージ・倍率）は残る。戻すと同じ", () => {
  const { actions, state } = newStore()
  actions.zoomStage("s1", 2)
  const before = screenOf(state.getState().window)
  actions.showControlCenter()
  expect(state.getState().window.front).toBe("control-center")
  expect(screenOf(state.getState().window)).toBe(before)
  actions.showBookScreen()
  expect(state.getState().window.front).toBe("book-screen")
  expect(screenOf(state.getState().window)).toBe(before)
})

test("止まり木のコマンドは、コントロールセンターを前に出し、前に出している間は押すとブックスクリーンへ戻る。前に出している間は押された状態", () => {
  const { actions, state, ...instance } = newStore()
  const active = () => isActive(instance as never, state.getState(), "s1", CENTER)
  expect(active()).toBe(false)
  expect(actions.command("s1", CENTER)).toBe(true)
  expect(state.getState().window.front).toBe("control-center")
  expect(active()).toBe(true)
  expect(actions.command("s1", CENTER)).toBe(true)
  expect(state.getState().window.front).toBe("book-screen")
  expect(active()).toBe(false)
})

test("ブックを開くと、ブックスクリーンを前に出す", () => {
  const { actions, state } = newStore()
  actions.showControlCenter()
  actions.openBook("s1", "b2")
  expect(state.getState().window.front).toBe("book-screen")
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
  expect(store.state.getState().window.front).toBe("book-screen")
  expect(screenOf(store.state.getState().window).stages[0]?.opened?.book).toBe("b2")
})
