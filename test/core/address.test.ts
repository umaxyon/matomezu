// 画面の場所（core/address.ts）: 見ているものから場所を出し、場所を当てはめ、移動したかを見分ける
import { expect, test } from "bun:test"
import { type Address, addressOf, moved, placeAt, type StagePlace } from "../../web/src/core/address"
import { paperOf, setArea, setStart } from "../../web/src/core/stage"
import { ZOOM_MAX, ZOOM_MIN } from "../../web/src/core/viewport"
import { screenOf } from "../../web/src/core/window"
import { newStore } from "../support"

const CENTER = "@matomezu/control-center:screen"
const BOOKS = "@matomezu/base:book-screen"
// 最初から開いているスクリーン（c1）と、ステージの並び places のブックスクリーン（c2。前に出ている）の場所
const at = (places: StagePlace[], current = 0, share = 0.5): Address => ({
  screens: [
    { id: "c1", def: CENTER, props: {}, states: {} },
    { id: "c2", def: BOOKS, props: {}, states: {}, stages: { places, current, share } },
  ],
  order: ["c1", "c2"],
  window: {},
})

test("場所は、開いているスクリーンと前に出した順、ブックスクリーンのステージごとのブック・ページ・倍率・ずらす量と、カレントと境目の割合", () => {
  const { state } = newStore()
  expect(addressOf(state.getState().window)).toEqual(
    at([{ book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 }, states: {} }]),
  )
})

test("場所を当てはめると、そのとおりにステージを開いて分ける。無いブックのステージは何も開かず、境目の割合は範囲に収める", () => {
  const store = newStore()
  const { catalog, state } = store
  const win = placeAt(
    catalog.core,
    state.getState().books,
    state.getState().window,
    at(
      [
        { book: "b3", page: "p1", zoom: 1, pan: { x: 0, y: 0 }, states: {} },
        { book: "nothing", page: null, zoom: 1, pan: { x: 0, y: 0 }, states: {} },
      ],
      1,
      0.99,
    ),
  )
  const ws = screenOf(win)
  expect(ws.stages.map(s => s.opened?.book ?? null)).toEqual(["b3", null])
  expect(ws.current).toBe(ws.stages[1]!.id)
  expect(ws.arrangement.share).toBe(0.85)
  // ステージの番号は使い回さず、足したステージには新しい番号
  expect(ws.stages[0]!.id).toBe("s1")
  expect(ws.stages[1]!.id).toBe("s2")
})

test("場所の倍率は、範囲に収める（URL から 0・負・極端な値・数でない値が来ても）", () => {
  const store = newStore()
  const { catalog, state } = store
  const zoomOf = (zoom: number) =>
    screenOf(
      placeAt(
        catalog.core,
        state.getState().books,
        state.getState().window,
        at([{ book: "b1", page: "p1", zoom, pan: { x: 0, y: 0 }, states: {} }], 0, 0.5),
      ),
    ).stages[0]!.zoom
  expect([zoomOf(0), zoomOf(-2), zoomOf(1e9), zoomOf(Number.NaN), zoomOf(1)]).toEqual([
    ZOOM_MIN,
    ZOOM_MIN,
    ZOOM_MAX,
    1,
    1,
  ])
})

test("移動は、スクリーン・前に出ている物・ステージの数か、ブック・ページが変わったとき（倍率・ずらす量・カレント・境目だけは移動ではない）", () => {
  const place = { book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 }, states: {} }
  const a = at([place])
  expect(moved(a, at([place], 0, 0.3))).toBe(false)
  expect(moved(a, at([{ ...place, zoom: 2, pan: { x: 10, y: 0 } }]))).toBe(false)
  expect(moved(a, at([{ ...place, book: "b2" }]))).toBe(true)
  expect(moved(a, at([place, { book: null, page: null, zoom: 1, pan: { x: 0, y: 0 }, states: {} }]))).toBe(true)
  expect(moved(a, { ...a, order: ["c2", "c1"] })).toBe(true)
  const opened = { id: "c3", def: CENTER, props: {}, states: {} }
  expect(moved(a, { ...a, screens: [...a.screens, opened], order: ["c3", "c1", "c2"] })).toBe(true)
})

test("場所のスクリーンを、その id のまま開き、場所に無いスクリーンは閉じる。無い定義と形に合わない値のスクリーンは開かない", () => {
  const { catalog, state } = newStore()
  const place = { book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 }, states: {} }
  const base = at([place])
  const more = [
    { id: "c5", def: CENTER, props: {}, states: {} },
    { id: "c6", def: "@ex/none:x", props: {}, states: {} },
    { id: "c7", def: CENTER, props: { extra: 1 }, states: {} },
  ]
  const address = { ...base, screens: [...base.screens, ...more], order: ["c1", "c2", "c5"] }
  const win = placeAt(catalog.core, state.getState().books, state.getState().window, address)
  expect(win.screens.map(s => s.id)).toEqual(["c1", "c2", "c5"])
  expect(win.order).toEqual(["c1", "c2", "c5"])
  expect(win.issuedScreens).toBe(5)
  // 場所に無くなったスクリーンは閉じる（最初から開いているスクリーンとブックスクリーンは、場所に無くても残る）
  const back = placeAt(catalog.core, state.getState().books, win, {
    ...base,
    screens: [base.screens[1]!],
    order: ["c2"],
  })
  expect(back.screens.map(s => s.id)).toEqual(["c1", "c2"])
  expect(back.order).toEqual(["c1", "c2"])
})

test("場所を当てはめたステージは、ずらす量が 0 でも、あとから届く初めの位置に合わせない（読み直す前に見ていた所のまま）", () => {
  const store = newStore()
  const { catalog, state } = store
  const ws = screenOf(
    placeAt(
      catalog.core,
      state.getState().books,
      state.getState().window,
      at([{ book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 }, states: {} }], 0, 0.5),
    ),
  )
  const stage = { ...ws.stages[0]!, view: { w: 400, h: 300 } }
  const sheet = paperOf(stage)!
  const arrived = setStart(setArea(stage, { w: sheet.w * 2, h: sheet.h }), { x: sheet.w, y: 0 })
  expect(arrived.pan).toEqual({ x: 0, y: 0 })
})

test("今と同じ場所を当てはめる（読み直しで URL が開いた直後と同じ）ときも、あとから届く初めの位置に合わせない", () => {
  const store = newStore()
  const { state, actions } = store
  actions.resizeStage("s1", { w: 400, h: 300 })
  expect(screenOf(state.getState().window).stages[0]!.starting).toBe(true)
  store.locate(addressOf(state.getState().window))
  const stage = screenOf(state.getState().window).stages[0]!
  expect(stage.starting).toBe(false)
  const sheet = paperOf(stage)!
  actions.setStageArea("s1", { w: sheet.w * 2, h: sheet.h })
  actions.setStageStart("s1", { x: sheet.w, y: 0 })
  expect(screenOf(state.getState().window).stages[0]!.pan).toEqual({ x: 0, y: 0 })
})
