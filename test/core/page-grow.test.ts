// 可変ページの広さ（base の place/grow.ts の grownArea）: 紙の大きさで区切った印刷区画を、中身が入るだけ並べる
import { expect, test } from "bun:test"
import { grownArea, printAreaLines } from "../../web/src/plugins/base/place/grow"

const A4 = { w: 794, h: 1123 }
const RIGHT_DOWN = { up: false, down: true, left: false, right: true }
const DOWN = { up: false, down: true, left: false, right: false }
const RIGHT = { up: false, down: false, left: false, right: true }
const ALL = { up: true, down: true, left: true, right: true }

test("中身が無ければ印刷区画 1 つ。中身の右下の端が入るだけ、増やす向き（右と下・下だけ）に並べる", () => {
  expect(grownArea(A4, RIGHT_DOWN, null)).toEqual({ columns: 1, rows: 1, size: A4 })
  expect(grownArea(A4, RIGHT_DOWN, { x: 700, y: 1000, w: 200, h: 200 })).toEqual({
    columns: 2,
    rows: 2,
    size: { w: 1588, h: 2246 },
  })
  // 下だけに伸びるなら、横は 1 つのまま
  expect(grownArea(A4, DOWN, { x: 0, y: 2000, w: 100, h: 500 })).toMatchObject({ columns: 1, rows: 3 })
})

test("端がちょうど境目なら次の印刷区画は足さない。spare なら右・下へ増やす向きに空きを 1 つずつ足す", () => {
  expect(grownArea(A4, RIGHT_DOWN, { x: 0, y: 0, w: 794 * 2, h: 1123 })).toMatchObject({ columns: 2, rows: 1 })
  expect(grownArea(A4, RIGHT_DOWN, null, true)).toMatchObject({ columns: 2, rows: 2 })
  expect(grownArea(A4, DOWN, null, true)).toMatchObject({ columns: 1, rows: 2 })
  expect(grownArea(A4, RIGHT, null, true)).toMatchObject({ columns: 2, rows: 1 })
})

test("左・上へ増やすなら、左・上の空きの印刷区画をデータに持つので少なくとも 2 つ。空きは右・下にだけ足す", () => {
  expect(grownArea(A4, ALL, null)).toMatchObject({ columns: 2, rows: 2 })
  expect(grownArea(A4, ALL, { x: 794, y: 1123, w: 100, h: 100 }, true)).toMatchObject({ columns: 3, rows: 3 })
  expect(grownArea(A4, { ...ALL, right: false }, { x: 794, y: 1123, w: 100, h: 100 }, true)).toMatchObject({
    columns: 2,
    rows: 3,
  })
})

test("区切りの線: 紙 1 枚に収まる広さなら無し。右に 2 つ・下に 3 つなら、縦の線 1 本と横の線 2 本の位置", () => {
  expect(printAreaLines(A4, A4)).toBeNull()
  expect(printAreaLines(A4, { w: A4.w * 2, h: A4.h * 3 })).toEqual({
    columns: 2,
    rows: 3,
    xs: [794],
    ys: [1123, 2246],
  })
})
