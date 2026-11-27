// コンテキストの棒の形（participant/context-gauge.ts）: 物差しの選び、物差しに対する割合と数、matomezu の分の内訳、9 割の判断
import { expect, test } from "bun:test"
import { contextGauge, contextScaleOf, NO_CONTEXT_USE } from "../../../web/src/plugins/base/participant/context-gauge"

// 物差しは auto なら AI の側の物差し、数ならその量。数は千で割って四捨五入し、棒は物差しを超えたら満杯で止める。9 割以上で nearFull
test("the gauge fills by the scale and turns near full at nine tenths", () => {
  expect(contextGauge({ used: 120_400, aiScale: 300_000, byMatomezu: 0 }, "auto")).toEqual({
    fill: 120_400 / 300_000,
    fillByMatomezu: 0,
    fillRest: 120_400 / 300_000,
    thousands: 120,
    percentByMatomezu: 0,
    percentRest: 100,
    nearFull: false,
  })
  expect(contextGauge({ used: 269_999, aiScale: 300_000, byMatomezu: 0 }, "auto")).toMatchObject({
    thousands: 270,
    nearFull: false,
  })
  expect(contextGauge({ used: 270_000, aiScale: 300_000, byMatomezu: 0 }, "auto")).toMatchObject({
    thousands: 270,
    nearFull: true,
  })
  expect(contextGauge({ used: 450_000, aiScale: 300_000, byMatomezu: 0 }, "auto")).toEqual({
    fill: 1,
    fillByMatomezu: 0,
    fillRest: 1,
    thousands: 450,
    percentByMatomezu: 0,
    percentRest: 100,
    nearFull: true,
  })
  expect(contextGauge({ used: 450_000, aiScale: 300_000, byMatomezu: 0 }, 1_000_000)).toMatchObject({
    fill: 0.45,
    nearFull: false,
  })
})

// matomezu の分は同じ物差しで割り、棒の満たす分を超えない。残りは満たす分から matomezu の分を引いた物。百分率は今の量の内訳
test("the matomezu share is measured by the same scale and stays within the fill", () => {
  const split = contextGauge({ used: 120_000, aiScale: 300_000, byMatomezu: 30_000 }, "auto")
  if (split === NO_CONTEXT_USE) throw new Error("no gauge")
  expect(split).toMatchObject({ fill: 0.4, fillByMatomezu: 0.1, percentByMatomezu: 25, percentRest: 75 })
  expect(split.fillRest).toBeCloseTo(0.3)
  expect(contextGauge({ used: 450_000, aiScale: 300_000, byMatomezu: 400_000 }, "auto")).toMatchObject({
    fill: 1,
    fillByMatomezu: 1,
    fillRest: 0,
  })
})

// 量が分からないか、物差しが正の数でなければ棒を出さない
test("no gauge without the use or a scale", () => {
  expect(contextGauge(NO_CONTEXT_USE, "auto")).toBe(NO_CONTEXT_USE)
  expect(contextGauge({ used: 1, aiScale: 300_000, byMatomezu: 0 }, 0)).toBe(NO_CONTEXT_USE)
})

// 利用者の設定の値が数ならその量を、ほか（auto・値の無いとき）は AI の側の物差しを使う
test("the scale comes from the setting, auto for the AI side's scale", () => {
  const use = { used: 270_000, aiScale: 1_000_000, byMatomezu: 0 }
  expect(contextGauge(use, contextScaleOf("auto"))).toMatchObject({ fill: 0.27, nearFull: false })
  expect(contextGauge(use, contextScaleOf(undefined))).toMatchObject({ fill: 0.27, nearFull: false })
  expect(contextGauge(use, contextScaleOf(300_000))).toMatchObject({ fill: 0.9, nearFull: true })
})
