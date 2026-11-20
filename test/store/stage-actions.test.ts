// store の窓とステージの操作（知らせ・ずらす量・分割・右クリックのメニュー・道具のアイコン・トースト）と、インスタンスだけが持つ receive
import { expect, test } from "bun:test"
import type { CommandId } from "../../web/src/core/catalog"
import { screenOf, screenOfStage } from "../../web/src/core/window"
import { currentStage } from "../../web/src/core/workspace"
import { isShown } from "../../web/src/store/commands"
import { NO_STAGE } from "../../web/src/store/dialogs"
import { newStore, sizedStore } from "../support"

test("変わらない操作では知らせない", () => {
  const { state, actions } = newStore()
  let calls = 0
  const off = state.subscribe(() => calls++)
  actions.focusStage("s1")
  actions.unsplit("s1")
  off()
  expect(calls).toBe(0)
})

test("store が持つずらす量は、表示領域の大きさで範囲に収めた値", () => {
  const { state, actions } = newStore()
  actions.resizeStage("s1", { w: 400, h: 300 })
  actions.panStageBy("s1", 500, 500)
  expect(screenOf(state.getState().window).stages[0]!.pan).toEqual({ x: 0, y: 0 })
})

test("閉じたステージへの分割と分割の取りやめは、ほかのステージにかけない", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  actions.closeStage("s2")
  actions.split("s1")
  const before = screenOf(state.getState().window)
  actions.unsplit("s2")
  actions.split("s2")
  expect(screenOf(state.getState().window)).toBe(before)
  expect(before.stages.map(s => s.id)).toEqual(["s1", "s3"])
})

test("右クリックのメニューは 1 つだけ出し、開いたステージが無くなれば閉じる。無いステージでは開かない。ステージを持たないスクリーンでも開く", () => {
  const { state, actions } = newStore()
  actions.split("s1")
  actions.openContextMenu("s1", "@matomezu/paper:paper-context", {}, { x: 10, y: 20 })
  actions.openContextMenu("s2", "@matomezu/paper:paper-context", {}, { x: 30, y: 40 })
  expect(state.getState().contextMenu).toEqual({
    id: "@matomezu/paper:paper-context",
    stage: "s2",
    screen: screenOfStage(state.getState().window, "s2")?.id as string,
    target: {},
    at: { x: 30, y: 40 },
    opens: "down",
  })
  actions.closeStage("s2")
  expect(state.getState().contextMenu).toBeNull()
  actions.openContextMenu("s9", "@matomezu/paper:paper-context", {}, { x: 0, y: 0 })
  expect(state.getState().contextMenu).toBeNull()
  actions.openContextMenu("s1", "@matomezu/paper:paper-context", {}, { x: 0, y: 0 })
  actions.closeContextMenu()
  expect(state.getState().contextMenu).toBeNull()
  // ステージを持たないスクリーン（コントロールセンター）から開くと、ステージは NO_STAGE で、スクリーンを持つ。Escape はそのスクリーンから閉じる
  const center = state.getState().window.screens.find(s => s.stages === undefined)?.id as string
  actions.makeScreenCurrent(center)
  actions.openContextMenu(center, "@matomezu/paper:paper-context", {}, { x: 0, y: 0 })
  expect(state.getState().contextMenu).toMatchObject({ stage: NO_STAGE, screen: center })
  expect(actions.pressKey("Escape")).toBe(true)
  expect(state.getState().contextMenu).toBeNull()
})

test("右クリックのメニューと道具のアイコンは同時に開かない。Escape と Space は、開いている方を閉じる", () => {
  const { state, actions } = sizedStore()
  const picking = () => currentStage(screenOf(state.getState().window)).picker
  actions.openPicker("s1", null)
  expect(picking()).not.toBeNull()
  actions.openContextMenu("s1", "@matomezu/paper:paper-context", {}, { x: 10, y: 20 })
  expect(state.getState().contextMenu).not.toBeNull()
  expect(picking()).toBeNull()
  actions.openPicker("s1", null)
  expect(picking()).not.toBeNull()
  expect(state.getState().contextMenu).toBeNull()
  // 道具のアイコンが開いている間は、範囲 picker の tool-picker-close が受ける
  expect(actions.pressKey("Escape")).toBe(true)
  expect(picking()).toBeNull()
  actions.openPicker("s1", null)
  expect(actions.pressKey("Space")).toBe(true)
  expect(picking()).toBeNull()
  // 右クリックのメニューが開いている間は、範囲 menu の menu-close が受ける
  actions.openContextMenu("s1", "@matomezu/paper:paper-context", {}, { x: 10, y: 20 })
  expect(actions.pressKey("Space")).toBe(true)
  expect(state.getState().contextMenu).toBeNull()
  // どちらも開いていなければ、どちらのコマンドも使えない
  expect(actions.command("s1", "@matomezu/base:menu-close")).toBe(false)
  expect(actions.command("s1", "@matomezu/base:tool-picker-close")).toBe(false)
})

test("ステージを持たないスクリーンで開いたメニューには、スクリーンから呼ぶコマンドの行だけ出る（ステージで呼ぶコマンドの行は出ない）", () => {
  const store = newStore()
  const { state, actions } = store
  const center = state.getState().window.screens.find(s => s.stages === undefined)?.id as string
  actions.makeScreenCurrent(center)
  actions.openContextMenu(center, "@matomezu/base:library-entry-context", { entry: "b1" }, { x: 0, y: 0 })
  const shown = (id: string) => isShown(store, state.getState(), center, id as CommandId)
  expect(shown("@matomezu/base:library-entry-rename")).toBe(true)
  expect(shown("@matomezu/base:library-entry-open")).toBe(true)
  expect(shown("@matomezu/base:library-book-new")).toBe(false) // ブックの中には作らない
  expect(shown("@matomezu/base:page-delete")).toBe(false)
  expect(shown("@matomezu/paper:paper-paste")).toBe(false)
  // ステージでは、ステージで呼ぶコマンドは出る（比べる相手）
  expect(isShown(store, state.getState(), "s1", "@matomezu/paper:paper-paste" as CommandId)).toBe(true)
})

test("ホストとの同期（receive）はインスタンスにあり、プラグインに渡す actions には無い（アクションを通さずに世界を入れ替えられないように）", () => {
  const instance = newStore()
  expect("receive" in instance.actions).toBe(false)
  expect(typeof instance.receive).toBe("function")
})

test("トーストは出した順に積み、id で消す（もう無い id なら何もしない）", () => {
  const { state, actions } = newStore()
  const a = actions.showToast({ kind: "warn", message: "@matomezu/flowchart:Does not fit on the paper" })
  const b = actions.showToast({ kind: "info", message: "@matomezu/flowchart:Auto align" })
  expect(a).not.toBe(b)
  expect(state.getState().toasts.map(t => t.id)).toEqual([a, b])
  actions.dismissToast(a)
  actions.dismissToast(a)
  expect(state.getState().toasts.map(t => t.id)).toEqual([b])
  // マーキーは info と success だけ（型で止める）
  actions.showToast({ kind: "info", form: "marquee", message: "@matomezu/flowchart:Auto align" })
  // @ts-expect-error 断りの知らせはマーキーにできない
  actions.showToast({ kind: "warn", form: "marquee", message: "@matomezu/flowchart:Auto align" })
})
