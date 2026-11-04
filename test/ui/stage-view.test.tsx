// ステージのビュー: パン（紙をずらす量）が変わっても、ステージのビューとその中のレイヤーは描き直さない（パンを読むレイヤーだけが描き直す）
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { BOOK_LAYERS } from "../../web/src/plugins/base/workspace/slots"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { defineWidget, placeAdded } from "../../web/src/ui/layout"
import { definePluginUi } from "../../web/src/ui/plugin"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { SAMPLE_BOOKS } from "../sample-books"
import { sequence } from "../support"

afterEach(cleanup)

test("パンしても、book-layers のレイヤーは描き直さない", () => {
  let drawn = 0
  const Counter = () => {
    drawn++
    return null
  }
  const counter = definePluginUi(definePlugin({ id: "count" }), {
    widgets: [defineWidget({ id: "count:layer", slots: [BOOK_LAYERS], view: Counter, place: BOOK_LAYERS })],
  })
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI, counter],
    partial: true,
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
  })
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, [counter])}>
      <Screen />
    </MatomezuProvider>,
  )
  act(() => {
    instance.actions.resizeStage("s1", { w: 1400, h: 1000 })
    instance.actions.openBook("s1", "b1")
    instance.actions.zoomStage("s1", 1.8) // 紙が表示領域からはみ出して、ずらせるように
  })
  const stage = () => instance.state.getState().workspace.stages[0]!
  expect(stage().opened?.paper).toBeTruthy()
  const before = drawn
  expect(before).toBeGreaterThan(0)
  const pan = stage().pan
  act(() => instance.actions.panStageBy("s1", -30, -20))
  expect(stage().pan).not.toEqual(pan)
  expect(drawn).toBe(before)
})
