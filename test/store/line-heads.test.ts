// 線の端の形（drawing/line/heads.ts）
import { expect, test } from "bun:test"
import { HEADS, headDraw } from "../../web/src/plugins/books/drawing/line/heads"

test("どの種類も何か描き、線を形の付け根で止める長さは 0 以上", () => {
  for (const h of HEADS) {
    const d = headDraw(h, [0, 0], [100, 0])
    expect(d.fill + d.stroke).not.toBe("")
    expect(d.trim).toBeGreaterThanOrEqual(0)
  }
})

test("headDraw: 長さ 1 未満の区間には何も描かず、線も縮めない。向きを変えても、形の付け根で止める長さは同じ", () => {
  for (const h of HEADS) {
    expect(headDraw(h, [0, 0], [0.5, 0.5])).toEqual({ fill: "", stroke: "", trim: 0 })
    const trims = [
      [100, 0],
      [0, 100],
      [-100, 0],
      [0, -100],
      [60, 80],
    ].map(([x, y]) => headDraw(h, [0, 0], [x!, y!]).trim)
    expect(new Set(trims).size).toBe(1)
  }
})

test("headDraw: 形は先端（tip）から出て、区間の長さを越えない範囲に描く（横向きの線なら x は先端から 21 以内、y は軸から ±7 以内。輪の半径の指定は点ではない）", () => {
  for (const h of HEADS) {
    const d = headDraw(h, [0, 50], [100, 50])
    const nums = (d.fill + d.stroke)
      .replace(/A4,4 0 1 1 /g, "L")
      .match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g)!
      .map(p => p.split(",").map(Number) as [number, number])
    for (const [x, y] of nums) {
      expect(x).toBeGreaterThanOrEqual(100 - 21)
      expect(x).toBeLessThanOrEqual(100)
      expect(Math.abs(y - 50)).toBeLessThanOrEqual(7)
    }
  }
})

test("白抜きの三角は線で描いて付け根（10）で止め、塗りの三角は塗る", () => {
  expect(headDraw("hollow", [0, 0], [100, 0])).toMatchObject({ fill: "", trim: 10 })
  expect(headDraw("arrow", [0, 0], [100, 0])).toMatchObject({ stroke: "", trim: 9 })
})
