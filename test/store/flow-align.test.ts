// フローチャートの整列の決まり（flowchart/align.ts の alignFlow）
import { expect, test } from "bun:test"
import { alignFlow } from "../../web/src/plugins/books/flowchart/align"

const OPTIONS = { centerX: 500, top: 20, gapX: 60, gapY: 40, sideDrop: 20 }

test("本筋は中央の縦の線にそろい、分岐の枝は右。合流する形は枝と同じ段で、枝からの線は横から入る", () => {
  const item = (id: string, w = 100, h = 60, start = false, branch = false) => ({ id, w, h, start, branch })
  const pos = alignFlow(
    [item("s", 120, 60, true), item("a"), item("d", 160, 80), item("y"), item("n", 140, 60)],
    [
      { from: "s", to: "a" },
      { from: "a", to: "d" },
      { from: "d", to: "y" },
      { from: "d", to: "n" },
      { from: "n", to: "y" },
    ],
    OPTIONS,
  )
  const cx = (id: string, w: number) => pos.get(id)!.x + w / 2
  expect([cx("s", 120), cx("a", 100), cx("d", 160), cx("y", 100)]).toEqual([500, 500, 500, 500])
  expect(cx("n", 140)).toBeGreaterThan(500)
  expect(pos.get("y")!.y).toBe(pos.get("n")!.y)
  expect(pos.get("s")!.y).toBe(20)
})

test("分岐から分岐へは縦につながず、子の分岐を右に、親の中心から sideDrop 下げて置く。その下へ続ける子は同じ列", () => {
  const item = (id: string, branch = false, start = false) => ({ id, w: 100, h: 60, start, branch })
  const pos = alignFlow(
    [item("s", false, true), item("d1", true), item("a"), item("d2", true), item("b"), item("c")],
    [
      { from: "s", to: "d1" },
      { from: "d1", to: "d2" },
      { from: "d1", to: "a" },
      { from: "d2", to: "b" },
      { from: "d2", to: "c" },
    ],
    OPTIONS,
  )
  const p = (id: string) => pos.get(id)!
  expect(p("a").x).toBe(p("d1").x)
  expect(p("d2").x).toBeGreaterThan(p("d1").x)
  expect(p("d2").y).toBe(p("d1").y + 30 + 20)
  expect(p("b").x).toBe(p("d2").x)
  expect(p("c").x).toBeGreaterThan(p("d2").x)
  expect(p("a").y).toBeGreaterThanOrEqual(p("d2").y + 60 + 40)
})

test("合流する形は、下へ続ける親の下で、ほかの親と同じ段まで上がり、その線は横からまっすぐ入る", () => {
  const item = (id: string, branch = false, start = false) => ({ id, w: 100, h: 60, start, branch })
  const pos = alignFlow(
    [item("s", false, true), item("d1", true), item("a1"), item("a2"), item("d2", true), item("loop"), item("u")],
    [
      { from: "s", to: "d1" },
      { from: "d1", to: "a1" },
      { from: "d1", to: "d2" },
      { from: "a1", to: "a2" },
      { from: "d2", to: "loop" },
      { from: "d2", to: "u" },
      { from: "a1", to: "loop" },
    ],
    OPTIONS,
  )
  const p = (id: string) => pos.get(id)!
  expect(p("loop").y).toBe(p("a1").y)
  expect(p("loop").x).toBe(p("d2").x)
  expect(p("a2").y).toBeGreaterThan(p("a1").y)
})

test("始まりは入る線の無い開始の形。線の無い形は、それまでの形の下に続ける", () => {
  const item = (id: string, start = false) => ({ id, w: 100, h: 60, start, branch: false })
  const pos = alignFlow([item("x"), item("s", true), item("lone")], [{ from: "s", to: "x" }], OPTIONS)
  expect(pos.get("s")!.y).toBe(20)
  expect(pos.get("x")!.y).toBeGreaterThan(pos.get("s")!.y)
  expect(pos.get("lone")!.y).toBeGreaterThan(pos.get("x")!.y)
})
