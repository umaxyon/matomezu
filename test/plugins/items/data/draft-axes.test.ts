// データのダイアログの下書きの軸（items/data/draft.ts）のうち、data-chart.test が確かめていない所: 行を消したときの印の詰め直し、系列の上限、確定できる軸か

import { expect, test } from "bun:test"
import { MAX_SERIES } from "../../../../web/src/plugins/items/data/data"
import {
  type AxesDraft,
  axesForText,
  axesOk,
  axesWithoutRow,
  type Draft,
  parseNumber,
  removeColumn,
  togglePicked,
  toggleValue,
  withView,
} from "../../../../web/src/plugins/items/data/draft"

const axes = (over: Partial<AxesDraft> = {}): AxesDraft => ({
  view: "bar",
  x: 0,
  values: [1],
  charts: [undefined],
  label: null,
  bar: "vertical",
  sort: "none",
  sortBy: null,
  crowd: "skip",
  skip: "even",
  picked: [],
  ...over,
})
const draft = (types: ("number" | "text")[]): Draft => ({
  columns: types.map((type, i) => ({ name: `c${i}`, type })),
  rows: [],
})

test("行を消すと、その行の印を外し、後ろの行の位置を 1 つ詰める。前の行はそのまま", () => {
  expect(axesWithoutRow(axes({ picked: [0, 1, 3] }), 1).picked).toEqual([0, 2])
  expect(axesWithoutRow(axesWithoutRow(axes({ picked: [2, 4] }), 0), 3).picked).toEqual([1])
})

test("項目の文字を出す行の印は、入れ替えるたびに行の順に並ぶ", () => {
  expect(togglePicked(axes({ picked: [3] }), 1).picked).toEqual([1, 3])
  expect(togglePicked(axes({ picked: [1, 3] }), 1).picked).toEqual([3])
})

test("最後の列を消すと、行も無くなる（列の無い表は持たない）", () => {
  const d: Draft = { columns: [{ name: "a", type: "number" }], rows: [{ cells: ["1"] }] }
  expect(removeColumn(d, 0)).toEqual({ columns: [], rows: [] })
})

test("値の列は入れ替えられ、系列は 8 本まで。外すと並びの系列の描き方も外れ、並べ替えの基準だった列なら基準も外れる", () => {
  const on = toggleValue(axes({ values: [1], charts: ["line"] }), 2)
  expect(on).toMatchObject({ values: [1, 2], charts: ["line", undefined] })
  const off = toggleValue(axes({ values: [1, 2], charts: ["line", undefined], sortBy: 1 }), 1)
  expect(off).toMatchObject({ values: [2], charts: [undefined], sortBy: null })
  const full = axes({
    values: Array.from({ length: MAX_SERIES }, (_, i) => i + 1),
    charts: Array(MAX_SERIES).fill(undefined),
  })
  expect(toggleValue(full, 20)).toBe(full)
})

test("列を文字の列にすると、値の列からだけ外れる", () => {
  expect(axesForText(axes({ values: [1, 2], charts: [undefined, undefined] }), 2).values).toEqual([1])
  const a = axes({ values: [1], charts: [undefined] })
  expect(axesForText(a, 3)).toBe(a)
})

test("軸が足りているのは、表か、X と値があって値が数の列のとき。散布図は X も数の列", () => {
  const d = draft(["text", "number", "number"])
  expect(axesOk(axes({ view: "table", x: null, values: [] }), d)).toBe(true)
  expect(axesOk(axes({ x: 0, values: [1] }), d)).toBe(true)
  expect(axesOk(axes({ x: null, values: [1] }), d)).toBe(false)
  expect(axesOk(axes({ x: 0, values: [] }), d)).toBe(false)
  expect(axesOk(axes({ x: 0, values: [0] }), d)).toBe(false)
  expect(axesOk(axes({ view: "scatter", x: 0, values: [1] }), d)).toBe(false)
  expect(axesOk(axes({ view: "scatter", x: 1, values: [2] }), d)).toBe(true)
})

test("見た目をグラフにするとき、数の列が無ければ値は空のまま、列がまったく無ければ X も選ばない", () => {
  const none = axes({ view: "table", x: null, values: [], charts: [] })
  expect(withView(none, draft(["text"]), "bar")).toMatchObject({ x: 0, values: [], charts: [] })
  expect(withView(none, draft([]), "bar")).toMatchObject({ x: null, values: [] })
})

test("数として読める文字は前後の空白を除いて数にし、空や数でなければ null", () => {
  expect(parseNumber(" 12.5 ")).toBe(12.5)
  expect(parseNumber("")).toBeNull()
  expect(parseNumber("  ")).toBeNull()
  expect(parseNumber("abc")).toBeNull()
  expect(parseNumber("Infinity")).toBeNull()
})
