// データの値が同じか（core/same.ts）
import { expect, test } from "bun:test"
import { sameData } from "../../web/src/core/same"

test("たどって比べる。フィールドの並びは見ず、undefined のフィールドは無いのと同じ。並びは順も長さも比べる", () => {
  expect(sameData({ a: 1, b: { c: "x" } }, { b: { c: "x" }, a: 1 })).toBe(true)
  expect(sameData({ a: 1, b: undefined }, { a: 1 })).toBe(true)
  expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
  expect(sameData([1], [1, 2])).toBe(false)
  expect(sameData({ a: "x" }, { a: "y" })).toBe(false)
  expect(sameData(null, {})).toBe(false)
  expect(sameData([], {})).toBe(false)
})
