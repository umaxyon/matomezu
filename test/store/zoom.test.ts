// base の拡大縮小のコマンド（zoom-in・zoom-out・zoom-reset・zoom-fit）と、倍率の範囲
import { expect, test } from "bun:test"
import { paperOf } from "../../web/src/core/stage"
import { MARGIN } from "../../web/src/core/viewport"
import { stepZoom, wheelZoom, ZOOM_MAX, ZOOM_MIN } from "../../web/src/plugins/base/zoom"
import type { CommandId } from "../../web/src/store/commands"
import { isEnabled } from "../../web/src/store/commands"
import { newStore } from "../support"

test("倍率は 30～180% の無段階。ボタンは 10% の倍数へ 1 つずつ動き（間なら近い向きの倍数へ）、ホイールは回した量に合わせて滑らかに変える", () => {
  expect(stepZoom(1, 1)).toBe(1.1)
  expect(stepZoom(1, -1)).toBe(0.9)
  expect(stepZoom(1.03, 1)).toBe(1.1)
  expect(stepZoom(1.03, -1)).toBe(1)
  expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
  expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  expect(stepZoom(0.35, -1)).toBe(ZOOM_MIN)
  const up = wheelZoom(1, -10)
  expect(up).toBeGreaterThan(1)
  expect(up).toBeLessThan(1.1)
  expect(wheelZoom(1, 100)).toBeLessThan(1)
  expect(wheelZoom(1, -100000)).toBe(ZOOM_MAX)
  expect(wheelZoom(1, 100000)).toBe(ZOOM_MIN)
})

test("拡大・縮小は範囲の端で押せず、初めの位置に戻すは開いたときの見え方では押せない", () => {
  const store = newStore()
  const { state, actions } = store
  actions.resizeStage("s1", { w: 400, h: 300 })
  const zoom = () => state.getState().workspace.stages[0]!.zoom
  const enabled = (id: CommandId) => isEnabled(store, state.getState(), "s1", id)
  expect(enabled("@matomezu/base:zoom-reset")).toBe(false)
  actions.command("s1", "@matomezu/base:zoom-in", null)
  expect([zoom(), enabled("@matomezu/base:zoom-reset")]).toEqual([1.1, true])
  for (const _ of Array(20)) actions.command("s1", "@matomezu/base:zoom-in", null)
  expect([zoom(), enabled("@matomezu/base:zoom-in")]).toEqual([ZOOM_MAX, false])
  for (const _ of Array(30)) actions.command("s1", "@matomezu/base:zoom-out", null)
  expect([zoom(), enabled("@matomezu/base:zoom-out")]).toEqual([ZOOM_MIN, false])
  expect(actions.pressKey("Home")).toBe(true)
  expect([zoom(), enabled("@matomezu/base:zoom-reset")]).toEqual([1, false])
})

test("ページ全体を収めると、紙が表示領域に入る倍率にして真ん中に置く。30% より小さくはしない。収めた見え方では押せない", () => {
  const store = newStore()
  const { state, actions } = store
  const stage = () => state.getState().workspace.stages[0]!
  const enabled = () => isEnabled(store, state.getState(), "s1", "@matomezu/base:zoom-fit")
  actions.resizeStage("s1", { w: 800, h: 600 })
  const paper = paperOf(stage())!
  expect(enabled()).toBe(true)
  actions.command("s1", "@matomezu/base:zoom-fit")
  const z = stage().zoom
  expect(paper.w * z).toBeLessThanOrEqual(800)
  expect(paper.h * z).toBeLessThanOrEqual(600)
  // 紙の真ん中が表示領域の真ん中
  const center = (view: number, pan: number, size: number) => pan + MARGIN + (size * z) / 2 - view / 2
  expect(Math.abs(center(800, stage().pan.x, paper.w))).toBeLessThan(1)
  expect(Math.abs(center(600, stage().pan.y, paper.h))).toBeLessThan(1)
  expect(enabled()).toBe(false)
  // 小さな表示領域では 30% で止める
  actions.resizeStage("s1", { w: 120, h: 90 })
  actions.command("s1", "@matomezu/base:zoom-fit")
  expect(stage().zoom).toBe(ZOOM_MIN)
})

test("Ctrl+ホイールのコマンドは、回した量を今の倍率に重ねる（続けて回すと重なる）。範囲の外へは出ない", () => {
  const store = newStore()
  const { state, actions } = store
  actions.resizeStage("s1", { w: 800, h: 600 })
  const zoom = () => state.getState().workspace.stages[0]!.zoom
  const at = { x: 400, y: 300 }
  actions.command("s1", "@matomezu/base:zoom-wheel", { delta: -100, at })
  const once = zoom()
  expect(once).toBe(wheelZoom(1, -100))
  actions.command("s1", "@matomezu/base:zoom-wheel", { delta: -100, at })
  expect(zoom()).toBe(wheelZoom(once, -100))
  actions.command("s1", "@matomezu/base:zoom-wheel", { delta: 100000, at })
  expect(zoom()).toBe(ZOOM_MIN)
})
