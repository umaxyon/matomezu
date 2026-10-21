import { expect, test } from "bun:test"
import { fitInside } from "../../web/src/core/geom"

test("fitInside は、はみ出す分だけ左と上に戻し、範囲より大きければ左上をそろえる", () => {
  const bounds = { w: 100, h: 80 }
  expect(fitInside({ x: 10, y: 10 }, { w: 30, h: 20 }, bounds)).toEqual({ x: 10, y: 10 })
  expect(fitInside({ x: 90, y: 70 }, { w: 30, h: 20 }, bounds)).toEqual({ x: 70, y: 60 })
  expect(fitInside({ x: 50, y: 50 }, { w: 200, h: 200 }, bounds)).toEqual({ x: 0, y: 0 })
})
