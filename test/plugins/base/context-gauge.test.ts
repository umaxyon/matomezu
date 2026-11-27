// コンテキストの棒の形（participant/context-gauge.ts）: 物差しに対する割合と数、9 割の判断
import { expect, test } from "bun:test"
import { contextGauge, NO_CONTEXT_USE } from "../../../web/src/plugins/base/participant/context-gauge"

// 物差しは auto なら AI の側の物差し、数ならその量。数は千で割って四捨五入し、棒は物差しを超えたら満杯で止める。9 割以上で nearFull
test("the gauge fills by the scale and turns near full at nine tenths", () => {
  expect(contextGauge({ used: 120_400, aiScale: 300_000 }, "auto")).toEqual({
    fill: 120_400 / 300_000,
    thousands: 120,
    nearFull: false,
  })
  expect(contextGauge({ used: 269_999, aiScale: 300_000 }, "auto")).toMatchObject({ thousands: 270, nearFull: false })
  expect(contextGauge({ used: 270_000, aiScale: 300_000 }, "auto")).toMatchObject({ thousands: 270, nearFull: true })
  expect(contextGauge({ used: 450_000, aiScale: 300_000 }, "auto")).toEqual({ fill: 1, thousands: 450, nearFull: true })
  expect(contextGauge({ used: 450_000, aiScale: 300_000 }, 1_000_000)).toMatchObject({ fill: 0.45, nearFull: false })
})

// 量が分からないか、物差しが正の数でなければ棒を出さない
test("no gauge without the use or a scale", () => {
  expect(contextGauge(NO_CONTEXT_USE, "auto")).toBe(NO_CONTEXT_USE)
  expect(contextGauge({ used: 1, aiScale: 300_000 }, 0)).toBe(NO_CONTEXT_USE)
})
