// 自分に戻る線の形（drawing/line/selfloop.ts）
import { expect, test } from "bun:test"
import type { Point } from "../../web/src/core/geom"
import { type Corner, cornerAt, nearestCorner, selfLoop } from "../../web/src/plugins/books/drawing/line/selfloop"

const box = { x: 100, y: 100, w: 120, h: 64 }
const rounded = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) })

test("既定は右上: 上の辺から出て右の辺に戻り、箱の外を回る", () => {
  const { points, corner } = selfLoop(box, [], 0)
  expect(corner).toBe("topRight")
  const [s, t] = [points[0]!, points.at(-1)!]
  expect(s.y).toBe(100) // 上の辺
  expect(s.x).toBeLessThan(220)
  expect(t.x).toBe(220) // 右の辺
  expect(t.y).toBeGreaterThan(100)
  // 途中の点は箱の外（右上の角の外側）
  for (const { x, y } of points.slice(1, -1)) expect(x > 220 || y < 100).toBe(true)
})

test("右上がほかの箱でふさがっていれば、空いている角を選ぶ", () => {
  const blocker = { x: 200, y: 20, w: 120, h: 70 } // 右上を覆う
  expect(selfLoop(box, [blocker], 0).corner).toBe("topLeft")
})

test("同じ角の 2 本目は、輪を大きくする", () => {
  const span = (pts: Point[]) => Math.max(...pts.map(p => p.x)) - 220
  expect(span(selfLoop(box, [], 1).points)).toBeGreaterThan(span(selfLoop(box, [], 0).points))
})

// ---- 端の位置（exitAt / enterAt は箱のふちを左上から時計回りに一周した割合） ----
// box は 120×64 なので一周 368。上の辺は 0〜120/368、右の辺は 120/368〜184/368、下は〜304/368、左は〜1

test("端の位置を指定すると、その 2 点を通る輪を、箱の外に描く", () => {
  const exit = 60 / 368,
    enter = 150 / 368 // 上の辺の真ん中、右の辺の上から 30
  const { points } = selfLoop(box, [], 0, [], { exit, enter })
  expect(points[0]).toEqual({ x: 160, y: 100 })
  expect(rounded(points.at(-1)!)).toEqual({ x: 220, y: 130 })
  for (const { x, y } of points.slice(1, -1)) expect(x > 220 || y < 100).toBe(true)
})

test("同じ辺に両端があっても、箱の外に描く", () => {
  const { points } = selfLoop(box, [], 0, [], { exit: 30 / 368, enter: 90 / 368 })
  for (const { y } of points.slice(1, -1)) expect(y).toBeLessThan(100.5)
})

test("向かいの辺に両端がある指定は使わず、自動の角に描く", () => {
  const auto = selfLoop(box, [], 0).points
  expect(selfLoop(box, [], 0, [], { exit: 60 / 368, enter: 240 / 368 }).points).toEqual(auto) // 上と下
})

test("端が動ける範囲は、もう一方の端の辺とその両隣の辺だけ", () => {
  const { ends } = selfLoop(box, [], 0, [], { exit: 60 / 368, enter: 150 / 368 })
  // 始点が動けるのは、終点（右の辺）とその両隣（上と下）: 左上 → 右上 → 右下 → 左下
  expect(ends.exit).toEqual([
    { x: 100, y: 100 },
    { x: 220, y: 100 },
    { x: 220, y: 164 },
    { x: 100, y: 164 },
  ])
  // 終点が動けるのは、始点（上の辺）とその両隣（左と右）: 左下 → 左上 → 右上 → 右下
  expect(ends.enter).toEqual([
    { x: 100, y: 164 },
    { x: 100, y: 100 },
    { x: 220, y: 100 },
    { x: 220, y: 164 },
  ])
})

test("ほかの線が輪の範囲を横切るなら（折れ点が範囲の外でも）、その角は使わない", () => {
  // 箱の上の辺のすぐ上を、横にまっすぐ通る線。折れ点（両端）は輪の範囲のずっと外
  const line: Point[] = [
    { x: 0, y: 85 },
    { x: 400, y: 85 },
  ]
  const { corner } = selfLoop(box, [], 0, [line])
  expect(corner).toBe("bottomRight")
})

// ---- 辺の境目・角の選び方・角の端の位置（純粋な関数） ----
// 辺は box のふち一周 368 の上で: 上 [0, 120)、右 [120, 184)、下 [184, 304)、左 [304, 368)。角の点は、そこから時計回りに進む辺に入る

// 途中の点が、箱の内側（縁から 0.5 より内）に入っていない
const outsideBox = (pts: Point[]) =>
  pts
    .slice(1, -1)
    .every(({ x, y }) => x <= box.x + 0.5 || x >= box.x + box.w - 0.5 || y <= box.y + 0.5 || y >= box.y + box.h - 0.5)

test("角の点は時計回りに進む辺に入る: 左下の角（304）は左の辺なので、上の辺と組めば使う。その手前（303）は下の辺なので使わない", () => {
  const auto = selfLoop(box, [], 0).points
  const leftCorner = selfLoop(box, [], 0, [], { exit: 60 / 368, enter: 304 / 368 }).points
  expect(leftCorner).not.toEqual(auto)
  expect(rounded(leftCorner.at(-1)!)).toEqual({ x: 100, y: 164 })
  expect(selfLoop(box, [], 0, [], { exit: 60 / 368, enter: 303 / 368 }).points).toEqual(auto)
  // 右上の角（120）は右の辺なので、下の辺と組めば使う
  const rightCorner = selfLoop(box, [], 0, [], { exit: 120 / 368, enter: 240 / 368 }).points
  expect(rounded(rightCorner[0]!)).toEqual({ x: 220, y: 100 })
  // 割合が小数の誤差なしに表せる正方形（一周 256、角は 0・0.25・0.5・0.75）で、境目そのものを確かめる
  const sq = { x: 0, y: 0, w: 64, h: 64 }
  const sqAuto = selfLoop(sq, [], 0).points
  expect(selfLoop(sq, [], 0, [], { exit: 0.125, enter: 0.75 }).points).not.toEqual(sqAuto) // 左下の角は左の辺（上と隣）
  expect(selfLoop(sq, [], 0, [], { exit: 0.125, enter: 0.5 }).points).toEqual(sqAuto) // 右下の角は下の辺（上と向かい）なので使わない
})

test("隣り合う辺・同じ辺のどの組でも（向きを入れ替えても）、輪は箱の中に入らない", () => {
  const mid = { t: 60, r: 152, b: 244, l: 336 } // 各辺の真ん中（一周 368 の上）
  const pairs: [keyof typeof mid, keyof typeof mid][] = [
    ["t", "r"],
    ["r", "b"],
    ["b", "l"],
    ["l", "t"],
    ["t", "t"],
    ["r", "r"],
  ]
  for (const [p, q] of pairs) {
    const [e, n] = [mid[p], mid[q] + (p === q ? 20 : 0)]
    for (const [s, t] of [
      [e, n],
      [n, e],
    ]) {
      const { points } = selfLoop(box, [], 0, [], { exit: s! / 368, enter: t! / 368 })
      expect([p, q, outsideBox(points)]).toEqual([p, q, true])
    }
  }
})

test("4 つの角のどれを選んでも、端は箱のふちの上にあり、輪は箱の外を回る。ふさがった角を順に飛ばす（右上 → 左上 → 右下 → 左下）", () => {
  const tr = { x: 210, y: 60, w: 60, h: 50 },
    tl = { x: 50, y: 60, w: 60, h: 50 }
  const br = { x: 210, y: 154, w: 60, h: 50 }
  const cases: [(typeof box)[], Corner][] = [
    [[], "topRight"],
    [[tr], "topLeft"],
    [[tr, tl], "bottomRight"],
    [[tr, tl, br], "bottomLeft"],
  ]
  for (const [blockers, want] of cases) {
    const { points, corner } = selfLoop(box, blockers, 0)
    expect(corner).toBe(want)
    expect(outsideBox(points)).toBe(true)
    for (const p of [points[0]!, points.at(-1)!]) {
      const onEdge = p.x === box.x || p.x === box.x + box.w || p.y === box.y || p.y === box.y + box.h
      expect(onEdge).toBe(true)
    }
  }
})

test("4 つの角がどれもふさがっていれば、既定の右上に描く", () => {
  const all = [
    { x: 0, y: 0, w: 400, h: 90 },
    { x: 0, y: 174, w: 400, h: 90 },
  ]
  expect(selfLoop(box, all, 0).corner).toBe("topRight")
})

test("小さい箱でも、角の端は辺の上（辺の長さの半分まで）に収める", () => {
  const small = { x: 0, y: 0, w: 20, h: 10 }
  const { points } = selfLoop(small, [], 0)
  expect(points[0]).toEqual({ x: 15, y: 0 }) // 上の辺。角から高さの半分（5）
  expect(points.at(-1)).toEqual({ x: 20, y: 5 }) // 右の辺
})

test("nearestCorner: 点が真ん中より右なら右、上半分なら上（真ん中の点は右下）", () => {
  expect(nearestCorner(box, { x: 105, y: 105 })).toBe("topLeft")
  expect(nearestCorner(box, { x: 215, y: 105 })).toBe("topRight")
  expect(nearestCorner(box, { x: 105, y: 160 })).toBe("bottomLeft")
  expect(nearestCorner(box, { x: 160, y: 132 })).toBe("bottomRight")
})

test("cornerAt: 角に描くときの端の位置（一周の割合）。その角がふさがっていれば null。返した位置で描けば箱の外を回る", () => {
  expect(cornerAt(box, [], 0, [], "topRight")).toEqual({ exit: (120 - 16) / 368, enter: (120 + 16) / 368 })
  expect(cornerAt(box, [{ x: 200, y: 20, w: 120, h: 70 }], 0, [], "topRight")).toBeNull()
  for (const c of ["topRight", "topLeft", "bottomRight", "bottomLeft"] as const) {
    const at = cornerAt(box, [], 1, [], c)!
    expect(outsideBox(selfLoop(box, [], 1, [], at).points)).toBe(true)
  }
})
