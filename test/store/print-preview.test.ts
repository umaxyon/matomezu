import { expect, test } from "bun:test"
import { isEnabled, isShown } from "../../web/src/store/commands"
import { newStore } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
const settled = () => Promise.resolve()
const stageOf = (store: ReturnType<typeof newStore>) => store.state.getState().workspace.stages[0]!
const bookOf = (store: ReturnType<typeof newStore>) => store.state.getState().books.b1 as { settings?: object }

function previewing() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: BOX, at: { x: 40, y: 40 }, props: { caption: "箱" } },
    { book: "b1" },
  )
  expect(store.actions.command("s1", "@matomezu/base:print-preview-open")).toBe(true)
  return store
}

test("印刷プレビューを開くと、右サイドパネルに印刷プレビューの中身を出す。印刷プレビューの間は、開くコマンドを出さない", () => {
  const store = previewing()
  expect(stageOf(store).mode.kind).toBe("print-preview")
  expect(store.state.getState().stageStates.s1?.["@matomezu/base"]).toMatchObject({
    rightSidePanel: { widget: "@matomezu/base:print-preview-panel", subject: "b1" },
  })
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/base:print-preview-open")).toBe(false)
})

test("印刷プレビューの間は、ブックを変えるコマンド（元に戻すも）が押せない。閉じれば押せる", async () => {
  const store = previewing()
  await settled()
  const state = () => store.state.getState()
  expect(isEnabled(store, state(), "s1", "@matomezu/base:undo")).toBe(false)
  expect(isEnabled(store, state(), "s1", "@matomezu/base:page-new")).toBe(false)
  expect(isEnabled(store, state(), "s1", "@matomezu/base:zoom-in")).toBe(true)
  store.actions.closePrintPreview("s1")
  expect(isEnabled(store, state(), "s1", "@matomezu/base:undo")).toBe(true)
})

test("印刷プレビューの設定は print-preview-update で変え、画面の履歴に入らない。book-update では変えられない", async () => {
  const store = previewing()
  await settled()
  const undo = () => store.state.getState().history.b1?.undo.length
  const before = undo()
  const done = store.actions.perform(
    "@matomezu/base:print-preview-update",
    { settings: { "@matomezu/base:print-preview-flow": "row" } },
    { book: "b1" },
  )
  await settled()
  expect(done.ok).toBe(true)
  expect(bookOf(store).settings).toEqual({ "@matomezu/base:print-preview-flow": "row" })
  expect(undo()).toBe(before)
  const refused = store.actions.perform(
    "@matomezu/base:book-update",
    { settings: { "@matomezu/base:print-preview-flow": "column" } },
    { book: "b1" },
  )
  expect(refused.ok).toBe(false)
  expect(bookOf(store).settings).toEqual({ "@matomezu/base:print-preview-flow": "row" })
})
