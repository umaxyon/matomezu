import { describe, expect, test } from "bun:test"
import { panBy } from "../../web/src/core/stage"
import {
  close,
  currentStage,
  focus,
  MAX_STAGES,
  mapStage,
  newWorkspace,
  showPage,
  split,
  unsplit,
} from "../../web/src/core/workspace"

describe("workspace", () => {
  const ws = newWorkspace("b1", "p1")

  test("分けると、カレントの右に何も開いていないステージが増え、カレントは変わらない", () => {
    const two = split(ws)
    expect(two.stages.map(s => s.id)).toEqual(["s1", "s2"])
    expect(two.stages[1]!.opened).toBeNull()
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
    const opened = showPage(two, "s1", "p2")
    expect(currentStage(opened).opened).toMatchObject({ page: "p2" })
    expect(opened.stages[1]).toBe(two.stages[1]!)
    const panned = mapStage(two, "s1", s => panBy(s, -10, -20))
    expect(panned.stages[0]!.pan).toEqual({ x: -10, y: -20 })
    expect(panned.stages[1]).toBe(two.stages[1]!)
  })

  test("ステージを閉じると、残りのステージだけになる。カレントを閉じたら残りがカレント", () => {
    const two = focus(split(ws), "s2")
    expect(close(two, "s1")).toMatchObject({ stages: [{ id: "s2" }], current: "s2" })
    const left = close(two, "s2")
    expect(left).toMatchObject({ stages: [{ id: "s1" }], current: "s1" })
    expect(close(focus(two, "s1"), "s1").current).toBe("s2")
  })

  test("変わらない操作は同じ値を返す", () => {
    expect(close(ws, "s1")).toBe(ws)
    expect(close(split(ws), "nope").stages).toHaveLength(2)
    expect(focus(ws, "s1")).toBe(ws)
    expect(focus(ws, "nope")).toBe(ws)
    expect(unsplit(ws)).toBe(ws)
    expect(mapStage(ws, "s1", s => panBy(s, 0, 0))).toBe(ws)
  })
})
