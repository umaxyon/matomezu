// ドラッグで端へ寄せている間にずらし続ける速さ（plugins/base/utils/edge-speed.ts）
import { expect, test } from "bun:test"
import { EDGE_MAX, EDGE_ZONE, edgeSpeed } from "../../web/src/plugins/base"

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
