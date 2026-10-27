// 線の端を散らす決まり（line/spread.ts）と、折れ目の一番少ない形（line/route.ts の fewestRoute）を、線を描く形（drawLines）で確かめる
import { expect, test } from "bun:test"
import type { Point, PortArea } from "../../web/src/plugin-api"
import { drawLines, linesBounds } from "../../web/src/plugins/items/line/drawn"
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

test("先の線の端と同じ所にある端は、空いている辺へ回す: 始点は反時計回り、終点は時計回りに探す（逆向きの線は左を回る）", () => {
  const rects = new Map<string, PortArea>([
    ["a", { x: 100, y: 100, w: 120, h: 48 }],
    ["g", { x: 120, y: 260, w: 80, h: 80 }],
  ])
  const [there, back] = drawLines([line("l1", "a", "g"), line("l2", "g", "a")], rects, true)
  // a から g へは、a の下から g の上へまっすぐ
  expect(first(there!.points)).toEqual({ x: 160, y: 148 })
  expect(last(there!.points)).toEqual({ x: 160, y: 260 })
  // g から a へは、g の左から出て（上から反時計回り）、a の左に入る（下から時計回り）
  // 端の位置はふち一周の割合（小数 4 桁）で決めるので、丸めのずれは見ない
  const round = (p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) })
  expect(round(first(back!.points))).toEqual({ x: 120, y: 300 })
  expect(round(last(back!.points))).toEqual({ x: 100, y: 124 })
})

test("回す先は、ほかの線と交わらず折れ目の少ない組み合わせ: 左と下がふさがった形から上の形へ戻る線は、右から出て右に入る", () => {
  const rects = new Map<string, PortArea>([
    ["up", { x: 120, y: 40, w: 80, h: 80 }],
    ["down", { x: 120, y: 200, w: 80, h: 80 }],
    ["d", { x: 104, y: 360, w: 112, h: 64, midpoints: true }],
  ])
  const drawn = drawLines(
    [line("l1", "up", "down"), line("l2", "down", "d"), line("l3", "d", "down"), line("l4", "down", "up")],
    rects,
    true,
  )
  const round = (p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) })
  const back = drawn.find(d => d.id === "l4")!
  // 下の形の左は d からの線、下は d への線が使う。戻る線は右から出て、上の形の右に入る（下から入ると上から来る線と交わる）
  expect(round(last(drawn.find(d => d.id === "l3")!.points))).toEqual({ x: 120, y: 240 })
  expect(round(first(back.points))).toEqual({ x: 200, y: 240 })
  expect(round(last(back.points))).toEqual({ x: 200, y: 80 })
})

test("線を描いたときの外枠（linesBounds）は、線の点の並びとキャプションの札を含む", () => {
  const rects = new Map<string, PortArea>([
    ["a", { x: 100, y: 100, w: 120, h: 48 }],
    ["g", { x: 120, y: 260, w: 80, h: 80 }],
  ])
  const b = linesBounds([line("l1", "a", "g"), line("l2", "g", "a")], rects, true)!
  // 戻る線は g の左から a の左へ回るので、外枠は形の左より外へ出る
  expect(b.x).toBeLessThan(100)
  expect(linesBounds([], rects, true)).toBeNull()
})
