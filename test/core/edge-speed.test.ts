// ドラッグで端へ寄せている間にずらし続ける速さと、紙をずらす量（plugins/base/utils/edge-speed.ts・edge-pan.ts）
import { expect, test } from "bun:test"
import { EDGE_MAX, EDGE_ZONE, edgeScroll, edgeSpeed } from "../../web/src/plugins/base"

test("端の帯に入ったら動き出し、深さの 2 乗で速くなり、端を越えたら一番速い。帯の外は 0", () => {
  expect(edgeSpeed(300, 0, 600)).toBe(0)
  expect(edgeSpeed(600 - EDGE_ZONE / 2, 0, 600)).toBe(EDGE_MAX / 4)
  expect(edgeSpeed(600, 0, 600)).toBe(EDGE_MAX)
  expect(edgeSpeed(700, 0, 600)).toBe(EDGE_MAX)
  expect(edgeSpeed(0, 0, 600)).toBe(-EDGE_MAX) // start の側へは負
})

test("範囲が狭ければ、帯は長さの 4 分の 1 まで狭める", () => {
  expect(edgeSpeed(50, 0, 100)).toBe(0) // 帯は 25
  expect(edgeSpeed(100, 0, 100)).toBe(EDGE_MAX)
})

test("表示領域の端に近ければ、その向きの物が見えるように紙をずらす（量は時間に比例）。端に近くなければずらさない", () => {
  const view = { w: 800, h: 600 }
  expect(edgeScroll({ x: 400, y: 300 }, view, 0.1)).toEqual({ x: -0, y: -0 })
  expect(edgeScroll({ x: 0, y: 300 }, view, 0.1).x).toBeCloseTo(EDGE_MAX * 0.1) // 左の端: 右へずらす
  expect(edgeScroll({ x: 0, y: 300 }, view, 0.05).x).toBeCloseTo(EDGE_MAX * 0.05)
  expect(edgeScroll({ x: 400, y: 600 }, view, 0.1).y).toBeCloseTo(-EDGE_MAX * 0.1) // 下の端: 上へずらす
})
