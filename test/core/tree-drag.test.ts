// 節のドラッグで落とす先（plugins/books/tree/drag.ts）: 節の真ん中なら子に、並びの向きの端の近くなら兄弟の前か後ろに、中央の木の根なら見た向きの子に
import { expect, test } from "bun:test"
import { EDGE_MAX } from "../../web/src/plugins/base"
import { DROP_PAD, dropAt, edgeScroll } from "../../web/src/plugins/books/tree/drag"
import { layoutTree } from "../../web/src/plugins/books/tree/layout"
import type { TreeRoot } from "../../web/src/plugins/books/tree/node"

const A4 = { w: 1123, h: 794 }
const tree: TreeRoot = {
  id: "r",
  caption: "根",
  children: [
    { id: "a", caption: "子 A", children: [{ id: "a1", caption: "孫" }] },
    { id: "b", caption: "子 B" },
    { id: "c", caption: "子 C" },
  ],
}
const laid = (root: TreeRoot, grow: "down" | "right" | "center") => layoutTree(root, grow, A4).nodes
const rectOf = (nodes: ReturnType<typeof laid>, id: string) => nodes.find(n => n.id === id)!

test("下へ伸びる木: 節の真ん中は子の末尾、左右の端（節の外の少しまで）は前か後ろの兄弟。印も返す", () => {
  const nodes = laid(tree, "down")
  const b = rectOf(nodes, "b")
  const mid = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  expect(dropAt(tree, "down", nodes, "c", mid)).toEqual({ parent: "b", mark: { kind: "into", node: "b" } })
  const left = dropAt(tree, "down", nodes, "c", { x: b.x - DROP_PAD / 2, y: mid.y })
  expect(left).toMatchObject({ parent: "r", index: 1, mark: { kind: "between" } }) // a の後ろ・b の前
  expect(left?.mark).toEqual({ kind: "between", from: { x: b.x - 4, y: b.y }, to: { x: b.x - 4, y: b.y + b.h } })
  // 動かす節を除いた並びで数える: a を b の後ろへは 1 番目（b, a, c）
  expect(dropAt(tree, "down", nodes, "a", { x: b.x + b.w - 1, y: mid.y })).toMatchObject({ parent: "r", index: 1 })
})

test("右へ伸びる木では、兄弟は上下に並ぶので、上下の端で兄弟になる", () => {
  const nodes = laid(tree, "right")
  const b = rectOf(nodes, "b")
  expect(dropAt(tree, "right", nodes, "c", { x: b.x + b.w / 2, y: b.y + 1 })).toMatchObject({
    parent: "r",
    index: 1,
  })
  expect(dropAt(tree, "right", nodes, "c", { x: b.x + b.w / 2, y: b.y + b.h / 2 })).toMatchObject({ parent: "b" })
})

test("動かす節と子孫・節の無い所には落とせない。根に落とせば根の子の末尾", () => {
  const nodes = laid(tree, "down")
  const a1 = rectOf(nodes, "a1")
  expect(dropAt(tree, "down", nodes, "a", { x: a1.x + a1.w / 2, y: a1.y + a1.h / 2 })).toBeNull()
  expect(dropAt(tree, "down", nodes, "a", { x: 1, y: 1 })).toBeNull()
  const r = rectOf(nodes, "r")
  expect(dropAt(tree, "down", nodes, "a1", { x: r.x + r.w / 2, y: r.y + r.h / 2 })).toEqual({
    parent: "r",
    mark: { kind: "into", node: "r" },
  })
})

test("中央の木: 根に落とせば、根の真ん中から見た向きへ伸びる子に。根の直系の兄弟になるときは、その兄弟の向き", () => {
  const center: TreeRoot = {
    id: "r",
    caption: "根",
    children: [
      { id: "u", caption: "上", side: "up" },
      { id: "l", caption: "左", side: "left", children: [{ id: "l1", caption: "孫" }] },
    ],
  }
  const nodes = laid(center, "center")
  const r = rectOf(nodes, "r")
  expect(dropAt(center, "center", nodes, "l1", { x: r.x + r.w / 2, y: r.y + 1 })).toMatchObject({ side: "up" })
  expect(dropAt(center, "center", nodes, "l1", { x: r.x + r.w - 1, y: r.y + r.h / 2 })).toMatchObject({
    side: "right",
  })
  const u = rectOf(nodes, "u")
  expect(dropAt(center, "center", nodes, "l1", { x: u.x + 1, y: u.y + u.h / 2 })).toMatchObject({
    parent: "r",
    side: "up",
  })
})

test("表示領域の端に近ければ、その向きの物が見えるように紙をずらす（量は時間に比例）。端に近くなければずらさない", () => {
  const view = { w: 800, h: 600 }
  expect(edgeScroll({ x: 400, y: 300 }, view, 0.1)).toEqual({ x: -0, y: -0 })
  expect(edgeScroll({ x: 0, y: 300 }, view, 0.1).x).toBeCloseTo(EDGE_MAX * 0.1) // 左の端: 右へずらす
  expect(edgeScroll({ x: 0, y: 300 }, view, 0.05).x).toBeCloseTo(EDGE_MAX * 0.05)
  expect(edgeScroll({ x: 400, y: 600 }, view, 0.1).y).toBeCloseTo(-EDGE_MAX * 0.1) // 下の端: 上へずらす
})
