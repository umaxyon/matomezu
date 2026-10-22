import { expect, test } from "bun:test"
import { dragRects, dropManyRects, dropRects, track } from "../../web/src/plugins/books/drawing/items/drag"
import { GAP, type Rect } from "../../web/src/plugins/books/drawing/items/push"

const PAPER = { w: 1123, h: 794 } // A4 横
const rects = (o: Record<string, Rect>) => new Map(Object.entries(o))
const r = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h })

// ドラッグを dx ずつ n 歩動かしたときに覚えた向き
function walk(before: Map<string, Rect>, id: string, steps: { x: number; y: number }[]) {
  let came = {}
  let prev = { x: 0, y: 0 }
  for (const by of steps) {
    came = track(before, id, prev, by, came)
    prev = by
  }
  return { came, by: prev }
}
const line = (x: number, y: number, n = 10) =>
  Array.from({ length: n }, (_, i) => ({ x: (x * (i + 1)) / n, y: (y * (i + 1)) / n }))

test("ドラッグ中はほかの箱を押さない。先端が正面から来た相手に半分まで入ると、相手を動かす箱の大きさと間隔の分だけ動き始めた側へずらす", () => {
  const before = rects({ a: r(100, 100), b: r(200 + GAP, 100) })
  const shallow = walk(before, "a", line(40, 0))
  expect(shallow.came).toEqual({ b: "right" })
  expect(dragRects(before, "a", shallow.by, shallow.came, PAPER).get("b")).toEqual(r(200 + GAP, 100))
  const deep = walk(before, "a", line(60, 0))
  expect(dragRects(before, "a", deep.by, deep.came, PAPER).get("b")).toEqual(r(100, 100))
})

test("角をかすめるだけ（正面でない）なら覚えず、入れ替えない。引き返して抜けたら忘れる", () => {
  const before = rects({ a: r(100, 100), b: r(200 + GAP, 140) })
  expect(walk(before, "a", line(60, 0)).came).toEqual({})
  const ahead = rects({ a: r(100, 100), b: r(200 + GAP, 100) })
  const there = walk(ahead, "a", line(40, 0))
  const back = track(ahead, "a", there.by, { x: 0, y: 0 }, there.came)
  expect(back).toEqual({})
})

test("離したとき: 入れ替えた相手とまだ近ければ向こう側へ寄せ、半分未満なら相手の手前へ戻す（相手は動かさない）", () => {
  const before = rects({ a: r(100, 100), b: r(200 + GAP, 100) })
  const deep = walk(before, "a", line(60, 0))
  const swapped = dropRects(before, "a", deep.by, deep.came, PAPER)!
  expect(swapped.get("b")).toEqual(r(100, 100))
  expect(swapped.get("a")).toEqual(r(200 + GAP, 100))
  const shallow = walk(before, "a", line(40, 0))
  const back = dropRects(before, "a", shallow.by, shallow.came, PAPER)!
  expect(back.get("a")).toEqual(r(100, 100))
  expect(back.get("b")).toEqual(r(200 + GAP, 100))
})

test("通り道が無い（AI が動かした）ときは、始めの位置から見た向きで決める。紙からはみ出すなら動かさない", () => {
  const before = rects({ a: r(100, 100), b: r(200 + GAP, 100) })
  expect(dropRects(before, "a", { x: 60, y: 0 }, undefined, PAPER)!.get("b")).toEqual(r(100, 100))
  expect(dropRects(before, "a", { x: 30, y: 0 }, undefined, PAPER)!.get("a")).toEqual(r(100, 100))
  expect(dropRects(before, "a", { x: 0, y: 300 }, undefined, PAPER)!.get("a")).toEqual(r(100, 400))
  expect(dropRects(before, "a", { x: -200, y: 0 }, undefined, PAPER)).toBeNull()
})

test("何個かまとめて動かしたときは入れ替えず、近すぎる相手の手前へまとめて戻す", () => {
  const before = rects({ a: r(100, 100), b: r(100, 200), c: r(300, 150) })
  const after = dropManyRects(before, new Set(["a", "b"]), { x: 150, y: 0 }, PAPER)!
  expect(after.get("a")).toEqual(r(300 - GAP - 100, 100))
  expect(after.get("b")).toEqual(r(300 - GAP - 100, 200))
  expect(after.get("c")).toEqual(r(300, 150))
})
