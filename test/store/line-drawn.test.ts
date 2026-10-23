// ページの線を描く形（drawing/line/drawn.ts の drawLines）
import { expect, test } from "bun:test"
import { drawLines } from "../../web/src/plugins/books/drawing/line/drawn"
import type { PlacedLine } from "../../web/src/plugins/books/drawing/line/placed"

const rects = new Map([
  ["a", { x: 100, y: 100, w: 100, h: 64 }],
  ["b", { x: 400, y: 100, w: 100, h: 64 }],
  ["c", { x: 100, y: 400, w: 100, h: 64 }],
])
const line = (id: string, from: string, to: string, props: PlacedLine["props"] = {}): PlacedLine => ({
  id,
  item: "connector.line",
  from,
  to,
  props,
})

test("横に並ぶ箱どうしは、向き合う辺の間をまっすぐ結ぶ。終点の矢印の分だけ、見える線を手前で止める", () => {
  const [l] = drawLines([line("l1", "a", "b", { endHead: "arrow" })], rects, true)
  expect(l!.points).toEqual([
    [200, 132],
    [400, 132],
  ])
  expect(l!.shown).toEqual([
    [200, 132],
    [391, 132],
  ])
  expect(l!.heads.fill).not.toBe("")
  expect(l!.heads.stroke).toBe("")
})

test("斜めに離れた箱どうしは、既定（折れ線）なら縦と横の区間だけで結び、直線なら 2 点で結ぶ", () => {
  const far = new Map([...rects, ["b", { x: 400, y: 300, w: 100, h: 64 }]])
  const [elbow] = drawLines([line("l1", "a", "b")], far, true)
  expect(elbow!.points.length).toBeGreaterThan(2)
  expect(elbow!.points.slice(1).every((q, i) => q[0] === elbow!.points[i]![0] || q[1] === elbow!.points[i]![1])).toBe(
    true,
  )
  expect(drawLines([line("l1", "a", "b", { route: "straight" })], far, true)[0]!.points).toHaveLength(2)
  expect(drawLines([line("l1", "a", "b")], far, false)[0]!.points).toHaveLength(2)
})

test("自分に戻る線は箱の角の輪。同じ箱の 2 本目は輪を大きくする。キャプションは自分に戻る線では上限の幅", () => {
  const [one, two] = drawLines([line("l1", "a", "a", { caption: "輪" }), line("l2", "a", "a")], rects, true)
  const span = (pts: readonly (readonly number[])[]) => Math.max(...pts.map(p => p[0]!)) - 200
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
