// base の拡大縮小のコマンド（zoom-in・zoom-out・zoom-reset）と、倍率の段
import { expect, test } from "bun:test"
import { stepZoom } from "../../web/src/plugins/base/zoom"
import type { CommandId } from "../../web/src/store/commands"
import { isEnabled } from "../../web/src/store/commands"
import { newStore } from "../support"

test("倍率は 50・75・100・125% の段を 1 つずつ動く（段の間なら近い段から）。端ではそのまま", () => {
  expect(stepZoom(1, 1)).toBe(1.25)
  expect(stepZoom(1.25, 1)).toBe(1.25)
  expect(stepZoom(0.75, -1)).toBe(0.5)
  expect(stepZoom(0.5, -1)).toBe(0.5)
  expect(stepZoom(0.8, 1)).toBe(1)
})

test("拡大・縮小は段の端で押せず、初めの位置に戻すは開いたときの見え方では押せない", () => {
  const store = newStore()
  const { state, actions } = store
  actions.resizeStage("s1", { w: 400, h: 300 })
  const zoom = () => state.getState().workspace.stages[0]!.zoom
  const enabled = (id: CommandId) => isEnabled(store, state.getState(), "s1", id)
  expect(enabled("@matomezu/base:zoom-reset")).toBe(false)
  actions.command("s1", "@matomezu/base:zoom-in", null)
  expect([zoom(), enabled("@matomezu/base:zoom-in"), enabled("@matomezu/base:zoom-reset")]).toEqual([1.25, false, true])
  for (const _ of [1, 2, 3]) actions.command("s1", "@matomezu/base:zoom-out", null)
  expect([zoom(), enabled("@matomezu/base:zoom-out")]).toEqual([0.5, false])
  expect(actions.pressKey("Home")).toBe(true)
  expect([zoom(), enabled("@matomezu/base:zoom-reset")]).toEqual([1, false])
})
