// ツリーの並べ方（plugins/books/tree/layout.ts）: 根は伸びる向きで紙の辺の中央（中央なら紙の真ん中）に置き、子は伸びる向きへ、兄弟は横に並べる
import { expect, test } from "bun:test"
import { layoutTree, MARGIN, nodeSize } from "../../web/src/plugins/books/tree/layout"

const PAPER = { w: 1123, h: 794 }
const root = { caption: "根", children: [] }
const family = {
  caption: "根",
  children: [
    { id: "a", caption: "子 A", children: [{ id: "a1", caption: "孫" }] },
    { id: "b", caption: "子 B" },
  ],
}
const at = (layout: ReturnType<typeof layoutTree>, id: string | null) => {
  const n = layout.nodes.find(x => x.id === id)
  if (!n) throw new Error(`no node ${id}`)
  return n
}

test("根は伸びる向きで置く: 下へは上辺の中央、上へは下辺の中央、右へは左辺の中央、左へは右辺の中央、中央は紙の真ん中", () => {
  const { w, h } = nodeSize("根")
  expect(at(layoutTree(root, "down", PAPER), null)).toMatchObject({ x: (PAPER.w - w) / 2, y: MARGIN, w, h })
  expect(at(layoutTree(root, "up", PAPER), null)).toMatchObject({ x: (PAPER.w - w) / 2, y: PAPER.h - MARGIN - h })
  expect(at(layoutTree(root, "right", PAPER), null)).toMatchObject({ x: MARGIN, y: (PAPER.h - h) / 2 })
  expect(at(layoutTree(root, "left", PAPER), null)).toMatchObject({ x: PAPER.w - MARGIN - w, y: (PAPER.h - h) / 2 })
  expect(at(layoutTree(root, "center", PAPER), null)).toMatchObject({ x: (PAPER.w - w) / 2, y: (PAPER.h - h) / 2 })
})

test("下へ伸びる木: 子は親の下に、兄弟は左右に並び、親は子の並びの真ん中に来る。線は親の下辺から子の上辺へ", () => {
  const l = layoutTree(family, "down", PAPER)
  const r = at(l, null)
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
  for (const id of [null, "a", "b", "a1"]) {
    expect(at(up, id).x).toBeCloseTo(at(down, id).x)
    expect(at(up, id).y + at(up, id).h).toBeCloseTo(PAPER.h - at(down, id).y)
  }
  const right = layoutTree(family, "right", PAPER)
  expect(at(right, "a").x).toBeGreaterThan(at(right, null).x + at(right, null).w)
  expect(at(right, "a").y + at(right, "a").h).toBeLessThan(at(right, "b").y)
  const left = layoutTree(family, "left", PAPER)
  expect(at(left, "a").x + at(left, "a").w).toBeLessThan(at(left, null).x)
})

test("中央の木は、子を右へ伸ばす", () => {
  const l = layoutTree(family, "center", PAPER)
  expect(at(l, "a").x).toBeGreaterThan(at(l, null).x + at(l, null).w)
})

test("紙からはみ出る木は fits が false", () => {
  const many = { caption: "根", children: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, caption: `子 ${i}` })) }
  expect(layoutTree(many, "right", PAPER).fits).toBe(false)
})
