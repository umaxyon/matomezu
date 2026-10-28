// ツリーの並べ方（plugins/books/tree/layout.ts）: 根は伸びる向きで紙の辺の中央（中央なら紙の真ん中）に置き、子は伸びる向きへ、兄弟は横に並べる
import { expect, test } from "bun:test"
import { plainOf } from "../../web/src/plugins/base/text/rich"
import { layoutTree, MARGIN, nodeSize, rootBox } from "../../web/src/plugins/books/tree/layout"
import { treePath } from "../../web/src/plugins/books/tree/line-shape"
import { DEFAULT_NODE_SIZE } from "../../web/src/plugins/books/tree/size"

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
  expect(l.lines).toContainEqual({
    from: { x: r.x + r.w / 2, y: r.y + r.h },
    to: { x: a.x + a.w / 2, y: a.y },
    side: "down",
  })
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

// 四角どうしが重なるか
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test("横長の紙の中央の木: 上下の枝が広がって右の枝とぶつかるなら、上下の枝は根の近くのまま、右の枝を重ならない所まで離す", () => {
  const ups = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, caption: `上の子 ${i}`, side: "up" as const }))
  const rights = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, caption: `右 ${i}` }))
  const tree = { id: "r", caption: "根", children: [...ups, ...rights] }
  const plain = layoutTree({ id: "r", caption: "根", children: ups }, "center", PAPER)
  const l = layoutTree(tree, "center", PAPER)
  // 上の枝の位置は、右の枝が無いときと同じ
  for (const u of ups) expect(at(l, u.id)).toEqual(at(plain, u.id))
  for (const u of ups) for (const x of rights) expect(overlap(at(l, x.id), at(l, u.id))).toBe(false)
  expect(at(l, "x0").x).toBeGreaterThan(at(l, "r").x + at(l, "r").w + 40) // いつもの間（40）より離れる
})

test("縦長の紙の中央の木: 左右の枝は根の近くのまま、上下の枝を離す", () => {
  const tall = { w: 794, h: 1123 }
  const lefts = Array.from({ length: 30 }, (_, i) => ({ id: `l${i}`, caption: `左 ${i}`, side: "left" as const }))
  const grand = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, caption: `上の孫 ${i}` }))
  const up = { id: "u", caption: "上の子", side: "up" as const, children: grand }
  const tree = { id: "r", caption: "根", children: [...lefts, up] }
  const l = layoutTree(tree, "center", tall)
  for (const n of lefts) for (const m of [up, ...grand]) expect(overlap(at(l, m.id), at(l, n.id))).toBe(false)
  expect(at(l, "u").y + at(l, "u").h).toBeLessThan(at(l, "r").y - 40) // いつもの間（40）より離れる
})

test("中央の木が紙からはみ出るとき、木全体が入るなら、根ごと余裕のある側へずらす。入らなければ fits が false", () => {
  const long = (n: number) => ({
    id: "r",
    caption: "根",
    children: [
      {
        id: "a",
        caption: "とても長いキャプションの右の子",
        children: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, caption: "とても長いキャプションの孫の節" })),
      },
    ],
  })
  const one = layoutTree(long(1), "center", { w: 700, h: 400 })
  expect(one.fits).toBe(true)
  expect(at(one, "r").x).toBeLessThan((700 - at(one, "r").w) / 2) // 根が左へずれた
  expect(layoutTree(long(1), "center", { w: 300, h: 400 }).fits).toBe(false)
})

test("節の大きさの選び方: 伸びるは 1 行の幅、N 字で固定は N 字の幅までで超えた分を … で切り、N 字で折り返すは N 字の幅で折り返して高くなる", () => {
  const long = "とても長いキャプションでこの節の幅を広げてしまう文"
  const grow = nodeSize(long, "grow")
  const fixed = nodeSize(long, "fixed-10")
  const wrapped = nodeSize(long, "wrap-10")
  expect(grow.lines).toEqual([long])
  expect(fixed.lines).toHaveLength(1)
  expect(fixed.lines[0]!.endsWith("…")).toBe(true)
  expect(fixed.w).toBeLessThan(grow.w)
  expect(wrapped.lines.length).toBeGreaterThan(1)
  expect(wrapped.lines.join("")).toBe(long)
  expect(wrapped.h).toBeGreaterThan(fixed.h)
  expect(wrapped.w).toBe(fixed.w) // どちらも 10 字の幅まで
  expect(nodeSize("短い", "fixed-10")).toEqual(nodeSize("短い", "grow")) // 幅に収まれば同じ
})

test("節の大きさは、節が選んでいればそれ、無ければページで効いている選び方で決める", () => {
  const long = "とても長いキャプションでこの節の幅を広げてしまう文"
  const tree = {
    id: "r",
    caption: "根",
    children: [
      { id: "a", caption: long },
      { id: "b", caption: long, size: "grow" as const },
    ],
  }
  const l = layoutTree(tree, "down", PAPER, "wrap-10")
  expect(at(l, "a").h).toBeGreaterThan(at(l, "b").h)
  expect(at(l, "b").w).toBe(nodeSize(long, "grow").w)
})

test("節の形が下線で左右へ伸びる枝は、線を節の下の辺（下線）の端につなぐ。上下へ伸びる枝は箱と同じ", () => {
  const tree = { id: "r", caption: "根", children: [{ id: "a", caption: "子 A" }] }
  const box = layoutTree(tree, "right", PAPER, "fixed-20", "box")
  const line = layoutTree(tree, "right", PAPER, "fixed-20", "underline")
  const a = at(line, "a")
  const r = at(line, "r")
  expect(line.lines[0]).toEqual({ from: { x: r.x + r.w, y: r.y + r.h }, to: { x: a.x, y: a.y + a.h }, side: "right" })
  expect(box.lines[0]!.to.y).toBe(a.y + a.h / 2)
  expect(layoutTree(tree, "down", PAPER, "fixed-20", "underline").lines).toEqual(
    layoutTree(tree, "down", PAPER, "fixed-20", "box").lines,
  )
})

test("線の形: まっすぐは 2 点の直線、折れ線は伸びる向きに半分進んで曲がり、曲線は伸びる向きに膨らむ", () => {
  const down = { from: { x: 0, y: 0 }, to: { x: 40, y: 100 }, side: "down" as const }
  const right = { from: { x: 0, y: 0 }, to: { x: 100, y: 40 }, side: "right" as const }
  expect(treePath(down, "straight")).toBe("M0,0 L40,100")
  expect(treePath(down, "elbow")).toBe("M0,0 V50 H40 V100")
  expect(treePath(right, "elbow")).toBe("M0,0 H50 V40 H100")
  expect(treePath(down, "curve")).toBe("M0,0 C0,50 40,50 40,100")
  expect(treePath(right, "curve")).toBe("M0,0 C50,0 50,40 100,40")
})

test("根の本文は装飾を区切りに分けて折り返し、幅は太字の幅で測る", () => {
  const plain = rootBox({ id: "r", caption: "根", body: "大事な所", showBody: true }, DEFAULT_NODE_SIZE)
  const bold = rootBox({ id: "r", caption: "根", body: "**大事な所**", showBody: true }, DEFAULT_NODE_SIZE)
  expect(bold.body?.map(plainOf)).toEqual(["大事な所"])
  expect(bold.body?.[0]?.[0]).toMatchObject({ bold: true })
  expect(bold.w).toBeGreaterThanOrEqual(plain.w)
})
