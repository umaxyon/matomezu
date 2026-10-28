// ツリーの並べ方（plugins/books/tree/layout.ts）: 根は伸びる向きで紙の辺の中央（中央なら紙の真ん中）に置き、子は伸びる向きへ、兄弟は横に並べる
import { expect, test } from "bun:test"
import { layoutTree, MARGIN, nodeSize } from "../../web/src/plugins/books/tree/layout"

const PAPER = { w: 1123, h: 794 }
const root = { id: "r", caption: "根", children: [] }
const family = {
  id: "r",
  caption: "根",
  children: [
    { id: "a", caption: "子 A", children: [{ id: "a1", caption: "孫" }] },
    { id: "b", caption: "子 B" },
  ],
}
const at = (layout: ReturnType<typeof layoutTree>, id: string) => {
  const n = layout.nodes.find(x => x.id === id)
  if (!n) throw new Error(`no node ${id}`)
  return n
}

test("根は伸びる向きで置く: 下へは上辺の中央、上へは下辺の中央、右へは左辺の中央、左へは右辺の中央、中央は紙の真ん中", () => {
  const { w, h } = nodeSize("根")
  expect(at(layoutTree(root, "down", PAPER), "r")).toMatchObject({ x: (PAPER.w - w) / 2, y: MARGIN, w, h })
  expect(at(layoutTree(root, "up", PAPER), "r")).toMatchObject({ x: (PAPER.w - w) / 2, y: PAPER.h - MARGIN - h })
  expect(at(layoutTree(root, "right", PAPER), "r")).toMatchObject({ x: MARGIN, y: (PAPER.h - h) / 2 })
  expect(at(layoutTree(root, "left", PAPER), "r")).toMatchObject({ x: PAPER.w - MARGIN - w, y: (PAPER.h - h) / 2 })
  expect(at(layoutTree(root, "center", PAPER), "r")).toMatchObject({ x: (PAPER.w - w) / 2, y: (PAPER.h - h) / 2 })
})

test("下へ伸びる木: 子は親の下に、兄弟は左右に並び、親は子の並びの真ん中に来る。線は親の下辺から子の上辺へ", () => {
  const l = layoutTree(family, "down", PAPER)
  const r = at(l, "r")
  const a = at(l, "a")
  const b = at(l, "b")
  const a1 = at(l, "a1")
  expect(a.y).toBeGreaterThan(r.y + r.h)
  expect(a.y).toBe(b.y)
  expect(a.x + a.w).toBeLessThan(b.x)
  expect(a1.y).toBeGreaterThan(a.y + a.h)
  expect(a1.x + a1.w / 2).toBeCloseTo(a.x + a.w / 2)
  expect(r.x + r.w / 2).toBeCloseTo((a.x + b.x + b.w) / 2)
  expect(l.lines).toHaveLength(3)
  expect(l.lines).toContainEqual({ from: { x: r.x + r.w / 2, y: r.y + r.h }, to: { x: a.x + a.w / 2, y: a.y } })
  expect(l.fits).toBe(true)
})

test("上へ伸びる木は下へ伸びる木を上下に返した形。右へ・左へは子が横へ、兄弟が上下に並ぶ", () => {
  const down = layoutTree(family, "down", PAPER)
  const up = layoutTree(family, "up", PAPER)
  for (const id of ["r", "a", "b", "a1"]) {
    expect(at(up, id).x).toBeCloseTo(at(down, id).x)
    expect(at(up, id).y + at(up, id).h).toBeCloseTo(PAPER.h - at(down, id).y)
  }
  const right = layoutTree(family, "right", PAPER)
  expect(at(right, "a").x).toBeGreaterThan(at(right, "r").x + at(right, "r").w)
  expect(at(right, "a").y + at(right, "a").h).toBeLessThan(at(right, "b").y)
  const left = layoutTree(family, "left", PAPER)
  expect(at(left, "a").x + at(left, "a").w).toBeLessThan(at(left, "r").x)
})

test("中央の木は、子を右へ伸ばす", () => {
  const l = layoutTree(family, "center", PAPER)
  expect(at(l, "a").x).toBeGreaterThan(at(l, "r").x + at(l, "r").w)
})

test("紙からはみ出る木は fits が false", () => {
  const many = {
    id: "r",
    caption: "根",
    children: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, caption: `子 ${i}` })),
  }
  expect(layoutTree(many, "right", PAPER).fits).toBe(false)
})

test("中央の木は、根の直系の子をそれぞれの向き（無ければ右）へ伸ばし、孫は親の枝の向きに伸びる", () => {
  const star = {
    id: "r",
    caption: "根",
    children: [
      { id: "u", caption: "上", side: "up" as const, children: [{ id: "g", caption: "孫" }] },
      { id: "d", caption: "下", side: "down" as const },
      { id: "l", caption: "左", side: "left" as const },
      { id: "x", caption: "右" },
    ],
  }
  const l = layoutTree(star, "center", PAPER)
  const r = at(l, "r")
  expect(at(l, "u").y + at(l, "u").h).toBeLessThan(r.y)
  expect(at(l, "g").y + at(l, "g").h).toBeLessThan(at(l, "u").y)
  expect(at(l, "d").y).toBeGreaterThan(r.y + r.h)
  expect(at(l, "l").x + at(l, "l").w).toBeLessThan(r.x)
  expect(at(l, "x").x).toBeGreaterThan(r.x + r.w)
  expect(l.lines).toHaveLength(5)
  expect(l.fits).toBe(true)
})
