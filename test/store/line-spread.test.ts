// 線の端を散らす決まり（line/spread.ts）と、折れ目の一番少ない形（line/route.ts の fewestRoute）を、線を描く形（drawLines）で確かめる
import { expect, test } from "bun:test"
import type { Point, PortArea } from "../../web/src/plugin-api"
import { drawLines } from "../../web/src/plugins/items/line/drawn"
import type { PlacedLine } from "../../web/src/plugins/items/line/placed"
import { assignVertices } from "../../web/src/plugins/items/line/spread"

const line = (id: string, from: string, to: string, props: PlacedLine["props"] = {}): PlacedLine => ({
  id,
  item: "@matomezu/line:connector-line",
  from,
  to,
  props,
})
const first = (pts: Point[]) => pts[0]!
const last = (pts: Point[]) => pts[pts.length - 1]!

test("頂点の割り当て: 相手の向きに近い頂点を、線ごとに別々に選ぶ。入ってくる線の頂点は、空いていれば避ける", () => {
  // 下と右の相手
  expect(
    assignVertices([
      { x: 0, y: 100 },
      { x: 100, y: 10 },
    ]),
  ).toEqual(["b", "r"])
  // 2 本とも右下: 下と右に分ける
  expect(
    assignVertices([
      { x: 100, y: 90 },
      { x: 100, y: 110 },
    ]).sort(),
  ).toEqual(["b", "r"])
  // 下の頂点に入ってくる線があれば、下は使わない
  expect(assignVertices([{ x: 0, y: 100 }], ["b"])).not.toEqual(["b"])
  // 5 本は割り当てない
  expect(assignVertices(Array.from({ length: 5 }, () => ({ x: 0, y: 1 })))).toEqual([null, null, null, null, null])
})

test("辺の真ん中だけにつなぐ形（ひし形）から出る 2 本の線は、別々の頂点から出る", () => {
  const rects = new Map<string, PortArea>([
    ["d", { x: 200, y: 100, w: 112, h: 64, midpoints: true }],
    // 左下と右下の相手。分けなければ、どちらも下の頂点から出る
    ["yes", { x: 20, y: 400, w: 112, h: 40 }],
    ["no", { x: 380, y: 400, w: 112, h: 40 }],
  ])
  const drawn = drawLines([line("l1", "d", "yes"), line("l2", "d", "no")], rects, true)
  const starts = drawn.map(d => first(d.points))
  expect(starts[0]).not.toEqual(starts[1])
  // どちらも頂点（辺の真ん中）
  for (const p of starts)
    expect([
      { x: 256, y: 100 },
      { x: 312, y: 132 },
      { x: 256, y: 164 },
      { x: 200, y: 132 },
    ]).toContainEqual(p)
})

test("同じ形の同じ所に入る 2 本の線は、片方を空いている辺へ逃がす", () => {
  const rects = new Map<string, PortArea>([
    ["t", { x: 300, y: 300, w: 100, h: 64, midpoints: true }],
    ["a", { x: 250, y: 100, w: 100, h: 64 }],
    ["b", { x: 360, y: 180, w: 100, h: 40 }],
  ])
  // どちらも上の頂点に入る所を、1 本は別の頂点へ
  const drawn = drawLines([line("l1", "a", "t"), line("l2", "b", "t")], rects, true)
  const ends = drawn.map(d => last(d.points))
  expect(ends).toContainEqual({ x: 350, y: 300 })
  expect(ends[0]).not.toEqual(ends[1])
})

test("斜めに離れた形どうしは、Z 字より折れ目の少ない L 字で結ぶ", () => {
  const rects = new Map<string, PortArea>([
    ["a", { x: 100, y: 100, w: 100, h: 64 }],
    ["b", { x: 400, y: 200, w: 100, h: 64 }],
  ])
  const [l] = drawLines([line("l1", "a", "b")], rects, true)
  expect(l!.points).toHaveLength(3)
})
