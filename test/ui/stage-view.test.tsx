// ステージのビュー: パン（紙をずらす量）が変わっても、ステージのビューとその中のレイヤーは描き直さない（パンを読むレイヤーだけが描き直す）

import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { openedPage } from "../../web/src/core/stage"
import { screenOf } from "../../web/src/core/window"
import { BOOK_LAYERS } from "../../web/src/plugins/base/workspace/slots"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { defineWidget, placeAdded } from "../../web/src/ui/layout"
import { definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { WindowRoot } from "../../web/src/ui/WindowRoot"
import { SAMPLE_BOOKS } from "../sample-books"
import { sequence, showFirstBook } from "../support"

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
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
  })
  showFirstBook(instance)
  render(
    <MatomezuProvider instance={instance} layout={placeAdded(DEFAULT_LAYOUT, [counter])}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  act(() => {
    instance.actions.resizeStage("s1", { w: 1400, h: 1000 })
    instance.actions.openBook("s1", "b1")
    instance.actions.zoomStage("s1", 1.8) // 紙が表示領域からはみ出して、ずらせるように
  })
  const stage = () => screenOf(instance.state.getState().window).stages[0]!
  expect(openedPage(stage().opened ?? null)?.paper).toBeTruthy()
  const before = drawn
  expect(before).toBeGreaterThan(0)
  const pan = stage().pan
  act(() => instance.actions.panStageBy("s1", -30, -20))
  expect(stage().pan).not.toEqual(pan)
  expect(drawn).toBe(before)
})
