// 可変ページの広さ（base の place/grow.ts の grownArea）: 紙の大きさで区切った印刷区画を、中身が入るだけ並べる
import { expect, test } from "bun:test"
import { grownArea, printAreaLines } from "../../web/src/plugins/base/place/grow"

const A4 = { w: 794, h: 1123 }

test("中身が無ければ印刷区画 1 つ。中身の右下の端が入るだけ、右と下（both）か下だけ（down）に並べる", () => {
  expect(grownArea(A4, "both", null)).toEqual({ columns: 1, rows: 1, size: A4 })
  expect(grownArea(A4, "both", { x: 700, y: 1000, w: 200, h: 200 })).toEqual({
    columns: 2,
    rows: 2,
    size: { w: 1588, h: 2246 },
  })
  // 下だけに伸びるなら、横は 1 つのまま
  expect(grownArea(A4, "down", { x: 0, y: 2000, w: 100, h: 500 })).toMatchObject({ columns: 1, rows: 3 })
})

test("端がちょうど境目なら次の印刷区画は足さない。spare なら伸びる向きに空きを 1 つずつ足す", () => {
  expect(grownArea(A4, "both", { x: 0, y: 0, w: 794 * 2, h: 1123 })).toMatchObject({ columns: 2, rows: 1 })
  expect(grownArea(A4, "both", null, true)).toMatchObject({ columns: 2, rows: 2 })
  expect(grownArea(A4, "down", null, true)).toMatchObject({ columns: 1, rows: 2 })
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
