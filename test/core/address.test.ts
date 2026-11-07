// 画面の場所（core/address.ts）: 見ているものから場所を出し、場所を当てはめ、移動したかを見分ける
import { expect, test } from "bun:test"
import { addressOf, moved, placeAt } from "../../web/src/core/address"
import { paperOf, setArea, setStart } from "../../web/src/core/stage"
import { newStore } from "../support"

test("場所は、ステージごとのブック・ページ・倍率・ずらす量と、カレントと境目の割合", () => {
  const { state } = newStore()
  expect(addressOf(state.getState().workspace)).toEqual({
    stages: [{ book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 } }],
    current: 0,
    share: 0.5,
  })
})

test("場所を当てはめると、そのとおりにステージを開いて分ける。無いブックのステージは何も開かず、境目の割合は範囲に収める", () => {
  const store = newStore()
  const { catalog, state } = store
  const ws = placeAt(catalog.core, state.getState().books, state.getState().workspace, {
    stages: [
      { book: "b3", page: "p1", zoom: 1, pan: { x: 0, y: 0 } },
      { book: "nothing", page: null, zoom: 1, pan: { x: 0, y: 0 } },
    ],
    current: 1,
    share: 0.99,
  })
  expect(ws.stages.map(s => s.opened?.book ?? null)).toEqual(["b3", null])
  expect(ws.current).toBe(ws.stages[1]!.id)
  expect(ws.arrangement.share).toBe(0.85)
  // ステージの番号は使い回さず、足したステージには新しい番号
  expect(ws.stages[0]!.id).toBe("s1")
  expect(ws.stages[1]!.id).toBe("s2")
})

test("移動は、ステージの数か、ブック・ページが変わったとき（倍率・ずらす量・カレント・境目だけは移動ではない）", () => {
  const a = {
    stages: [{ book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 } }],
    current: 0,
    share: 0.5,
  }
  expect(moved(a, { ...a, share: 0.3, current: 0 })).toBe(false)
  expect(moved(a, { ...a, stages: [{ ...a.stages[0]!, zoom: 2, pan: { x: 10, y: 0 } }] })).toBe(false)
  expect(moved(a, { ...a, stages: [{ ...a.stages[0]!, book: "b2" }] })).toBe(true)
  expect(
    moved(a, {
      ...a,
      stages: [...a.stages, { book: null, page: null, zoom: 1, pan: { x: 0, y: 0 } }],
    }),
  ).toBe(true)
})

test("場所を当てはめたステージは、ずらす量が 0 でも、あとから届く初めの位置に合わせない（読み直す前に見ていた所のまま）", () => {
  const store = newStore()
  const { catalog, state } = store
  const ws = placeAt(catalog.core, state.getState().books, state.getState().workspace, {
    stages: [{ book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 } }],
    current: 0,
    share: 0.5,
  })
  const stage = { ...ws.stages[0]!, view: { w: 400, h: 300 } }
  const sheet = paperOf(stage)!
  const arrived = setStart(setArea(stage, { w: sheet.w * 2, h: sheet.h }), { x: sheet.w, y: 0 })
  expect(arrived.pan).toEqual({ x: 0, y: 0 })
})

test("今と同じ場所を当てはめる（読み直しで URL が開いた直後と同じ）ときも、あとから届く初めの位置に合わせない", () => {
  const store = newStore()
  const { state, actions } = store
  actions.resizeStage("s1", { w: 400, h: 300 })
  expect(state.getState().workspace.stages[0]!.opened?.starting).toBe(true)
  store.locate(addressOf(state.getState().workspace))
  const stage = state.getState().workspace.stages[0]!
  expect(stage.opened?.starting).toBeUndefined()
  const sheet = paperOf(stage)!
  actions.setStageArea("s1", { w: sheet.w * 2, h: sheet.h })
  actions.setStageStart("s1", { x: sheet.w, y: 0 })
  expect(state.getState().workspace.stages[0]!.pan).toEqual({ x: 0, y: 0 })
})
