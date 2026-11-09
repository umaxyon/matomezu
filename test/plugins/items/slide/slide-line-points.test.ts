// 線の点と項目の変換（items/slide/slide.ts）: 項目から出した点を項目に戻すと、同じ物に戻る
import { expect, test } from "bun:test"
import {
  FREE_LINE,
  linePointsOf,
  linePropsOf,
  movedLineProps,
  STRAIGHT_LINE,
} from "../../../../web/src/plugins/items/slide/slide"

test("直線: 項目が無ければ枠の左上から右下、あれば from・to。点から項目に戻せる", () => {
  expect(linePointsOf(STRAIGHT_LINE.id, {})).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ])
  const props = { from: { x: 0.1, y: 0.2 }, to: { x: 0.9, y: 0.4 } }
  expect(linePropsOf(STRAIGHT_LINE.id, linePointsOf(STRAIGHT_LINE.id, props))).toEqual(props)
})

test("自由な線: 点の並びをそのまま出し、そのまま項目に戻せる。線でない種類は点が無い", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0.5, y: 1 },
    { x: 1, y: 0 },
  ]
  expect(linePropsOf(FREE_LINE.id, linePointsOf(FREE_LINE.id, { points }))).toEqual({ points })
  expect(linePointsOf("other:item", { points })).toEqual([])
})

test("点を動かしたときの項目は、点と一緒に角度と比率の固定を外し、元の比率を動かした後の枠の比率にする", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]
  expect(movedLineProps(STRAIGHT_LINE.id, points, { w: 200, h: 80 })).toEqual({
    from: points[0],
    to: points[1],
    rotation: null,
    lockRatio: null,
    ratio: 2.5,
  })
})
