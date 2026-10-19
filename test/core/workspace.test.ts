import { describe, expect, test } from "bun:test"
import {
  currentStage,
  focus,
  MAX_STAGES,
  newWorkspace,
  setPan,
  showPage,
  split,
  unsplit,
} from "../../web/src/core/workspace"

describe("workspace", () => {
  const ws = newWorkspace("b1", "p1")

  test("分けると、カレントの右に同じページのステージが増え、カレントは変わらない", () => {
    const two = split(ws)
    expect(two.stages.map(s => s.id)).toEqual(["s1", "s2"])
    expect(two.stages[1]).toMatchObject({ book: "b1", page: "p1" })
    expect(two.current).toBe("s1")
  })

  test("上限より多くは分けない", () => {
    let w = ws
    for (let i = 0; i < MAX_STAGES + 2; i++) w = split(w)
    expect(w.stages).toHaveLength(MAX_STAGES)
  })

  test("分けるのをやめると、カレントのステージだけが残る", () => {
    const two = focus(split(ws), "s2")
    const one = unsplit(two)
    expect(one.stages.map(s => s.id)).toEqual(["s2"])
    expect(one.current).toBe("s2")
  })

  test("ページを開くのも、ずらすのも、そのステージだけが変わり、ほかは同じものを使い回す", () => {
    const two = split(ws)
    const opened = showPage(two, "p2")
    expect(currentStage(opened).page).toBe("p2")
    expect(opened.stages[1]).toBe(two.stages[1]!)
    const panned = setPan(two, "s2", { x: -10, y: -20 })
    expect(panned.stages[1]!.pan).toEqual({ x: -10, y: -20 })
    expect(panned.stages[0]).toBe(two.stages[0]!)
  })

  test("変わらない操作は同じ値を返す", () => {
    expect(focus(ws, "s1")).toBe(ws)
    expect(focus(ws, "nope")).toBe(ws)
    expect(unsplit(ws)).toBe(ws)
    expect(setPan(ws, "s1", { x: 0, y: 0 })).toEqual(ws)
  })
})
