// ページの線を描く形（drawing/line/drawn.ts の drawLines）
import { expect, test } from "bun:test"
import type { Point } from "../../web/src/core/geom"
import { drawLines } from "../../web/src/plugins/items/line/drawn"
import type { PlacedLine } from "../../web/src/plugins/items/line/placed"

const rects = new Map([
  ["a", { x: 100, y: 100, w: 100, h: 64 }],
  ["b", { x: 400, y: 100, w: 100, h: 64 }],
  ["c", { x: 100, y: 400, w: 100, h: 64 }],
])
const line = (id: string, from: string, to: string, props: PlacedLine["props"] = {}): PlacedLine => ({
  id,
  item: "@matomezu/line:connector-line",
  from,
  to,
  props,
})

test("横に並ぶ箱どうしは、向き合う辺の間をまっすぐ結ぶ。終点の矢印の分だけ、見える線を手前で止める", () => {
  const [l] = drawLines([line("l1", "a", "b", { endHead: "arrow" })], rects, true)
  expect(l!.points).toEqual([
    { x: 200, y: 132 },
    { x: 400, y: 132 },
  ])
  expect(l!.shown).toEqual([
    { x: 200, y: 132 },
    { x: 391, y: 132 },
  ])
  expect(l!.heads.fill).not.toBe("")
  expect(l!.heads.stroke).toBe("")
})

test("斜めに離れた箱どうしは、既定（折れ線）なら縦と横の区間だけで結び、直線なら 2 点で結ぶ", () => {
  const far = new Map([...rects, ["b", { x: 400, y: 300, w: 100, h: 64 }]])
  const [elbow] = drawLines([line("l1", "a", "b")], far, true)
  expect(elbow!.points.length).toBeGreaterThan(2)
  expect(elbow!.points.slice(1).every((q, i) => q.x === elbow!.points[i]!.x || q.y === elbow!.points[i]!.y)).toBe(true)
  expect(drawLines([line("l1", "a", "b", { route: "straight" })], far, true)[0]!.points).toHaveLength(2)
  expect(drawLines([line("l1", "a", "b")], far, false)[0]!.points).toHaveLength(2)
})

test("自分に戻る線は箱の角の輪。同じ箱の 2 本目は輪を大きくする。キャプションは自分に戻る線では上限の幅", () => {
  const [one, two] = drawLines([line("l1", "a", "a", { caption: "輪" }), line("l2", "a", "a")], rects, true)
  const span = (pts: readonly Point[]) => Math.max(...pts.map(p => p.x)) - 200
  expect(span(two!.points)).toBeGreaterThan(span(one!.points))
  expect(one!.caption?.box.w).toBe(160)
})

test("破線・キャプション（空白だけなら無し）・両端の形が無い線は描かない", () => {
  const drawn = drawLines(
    [
      line("l1", "a", "b", { dash: "dashed", caption: " 申請 " }),
      line("l2", "a", "c", { caption: "  " }),
      line("l3", "a", "zz"),
    ],
    rects,
    true,
  )
  expect(drawn.map(l => l.id)).toEqual(["l1", "l2"])
  expect(drawn[0]!.dashed).toBe(true)
  expect(drawn[0]!.caption?.text).toBe("申請")
  expect(drawn[1]!.caption).toBeNull()
})

test("前の辺の記憶: 渡した線は、自由な端が前に描いた辺に留まる（折れ目 3 まで）。loose なら、一番よい形より折れ目が 3 以上多いとき留まらない", () => {
  const a = { x: 40, y: 40, w: 120, h: 64 }
  const first = drawLines(
    [line("l1", "a", "b")],
    new Map([
      ["a", a],
      ["b", { x: 400, y: 300, w: 120, h: 64 }],
    ]),
    true,
  )[0]!
  expect(first.memory).toEqual({ exit: { side: "r", at: 0.5 }, enter: { side: "t", at: 0.5 } })
  // b を a の真下へ動かす。一番よい形はまっすぐだが、記憶を渡すと右から出て b の上へ入る形に留まる
  const below = new Map([
    ["a", a],
    ["b", { x: 60, y: 300, w: 120, h: 64 }],
  ])
  const memory = new Map([["l1", first.memory!]])
  const kept = drawLines([line("l1", "a", "b")], below, true, { memory })[0]!
  expect([kept.points[0], kept.points.length - 2]).toEqual([{ x: 160, y: 72 }, 3])
  expect(drawLines([line("l1", "a", "b")], below, true)[0]!.points).toHaveLength(2)
  // 手を離したとき（loose）: 留まった形（折れ目 3）は一番よい形（0）より 3 多いので、一番よい形にする
  const loose = drawLines([line("l1", "a", "b")], below, true, { memory, loose: new Set(["l1"]) })[0]!
  expect(loose.points).toHaveLength(2)
})

test("道筋の覚え: 入力（両端の形・道筋に関わるほかの形・項目・記憶）が同じ線は、計算し直さずに覚えた形を使う", () => {
  const cache = new Map()
  const lines = [line("l1", "a", "b"), line("l2", "a", "c")]
  const first = drawLines(lines, rects, true, { cache })
  // 遠くの形が動いても、どちらの線の入力も変わらない
  const moved = new Map([...rects, ["far", { x: 1000, y: 700, w: 50, h: 50 }]])
  const again = drawLines(lines, moved, true, { cache })
  expect(again[0]!.points).toBe(first[0]!.points)
  expect(again[1]!.points).toBe(first[1]!.points)
  // b が動くと l1 だけ計算し直す
  const bMoved = new Map([...rects, ["b", { x: 420, y: 100, w: 100, h: 64 }]])
  const third = drawLines(lines, bMoved, true, { cache })
  expect(third[0]!.points).not.toBe(first[0]!.points)
  expect(third[1]!.points).toBe(first[1]!.points)
})
