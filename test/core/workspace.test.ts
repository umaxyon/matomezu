import { describe, expect, test } from "bun:test"
import { panBy } from "../../web/src/core/stage"
import {
  close,
  currentStage,
  EVEN_SHARE,
  evenDivider,
  focus,
  followBook,
  followLibrary,
  MAX_STAGES,
  MIN_SHARE,
  mapStage,
  moveDivider,
  newWorkspace,
  showPage,
  split,
  unsplit,
} from "../../web/src/core/workspace"
import { CORE_CATALOG } from "../support"

describe("workspace", () => {
  const book = {
    type: "@matomezu/drawing:drawing" as const,
    id: "b1",
    title: "見本",
    pages: [
      { id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" as const },
      { id: "p2", title: "ページ 2", paper: "@matomezu/base:a4", orientation: "landscape" as const },
    ],
  }
  const ws = newWorkspace(CORE_CATALOG, book)

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
    const opened = showPage(CORE_CATALOG, two, "s1", book, "p2")
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

  test("ステージの id は使い回さない。閉じたあとに分けても、新しい番号を振る", () => {
    const reopened = split(close(split(ws), "s1"))
    expect(reopened.stages.map(s => s.id)).toEqual(["s2", "s3"])
    expect(split(close(reopened, "s3")).stages.map(s => s.id)).toEqual(["s2", "s4"])
  })

  test("変わらない操作は同じ値を返す", () => {
    expect(close(ws, "s1")).toBe(ws)
    expect(close(split(ws), "nope").stages).toHaveLength(2)
    expect(focus(ws, "s1")).toBe(ws)
    expect(focus(ws, "nope")).toBe(ws)
    expect(unsplit(ws)).toBe(ws)
    expect(mapStage(ws, "s1", s => panBy(s, 0, 0))).toBe(ws)
  })

  test("ブックが変わると、開いているステージを合わせる。開いていたページが無くなれば最初のページ、紙が変われば紙を決め直す", () => {
    const two = showPage(CORE_CATALOG, split(ws), "s1", book, "p2")
    const both = mapStage(two, "s2", s => ({ ...s, opened: two.stages[0]!.opened }))
    const removed = { ...book, pages: [book.pages[0]!] }
    expect(followBook(CORE_CATALOG, both, removed).stages.map(s => s.opened?.page)).toEqual(["p1", "p1"])
    const a3 = { ...book, pages: [book.pages[0]!, { ...book.pages[1]!, paper: "@matomezu/base:a3" }] }
    expect(followBook(CORE_CATALOG, both, a3).stages[0]!.opened?.paper).toMatchObject({
      status: "known",
      size: { w: 1587, h: 1123 },
    })
    expect(followBook(CORE_CATALOG, both, book)).toBe(both)
  })

  test("ブックの一覧が変わると、無くなったブックを開いていたステージは何も開かない", () => {
    const two = split(ws)
    expect(followLibrary(CORE_CATALOG, two, {}).stages.map(s => s.opened)).toEqual([null, null])
    expect(followLibrary(CORE_CATALOG, two, { b1: book })).toBe(two)
  })

  test("境目を動かすと左の幅の割合が変わり、端には寄り切らない。分割をやめても覚えていて、真ん中に戻せる", () => {
    const moved = moveDivider(split(ws), 300, 1000)
    expect(moved.arrangement.share).toBe(0.3)
    expect(moveDivider(moved, 0, 1000).arrangement.share).toBe(MIN_SHARE)
    expect(moveDivider(moved, 1000, 1000).arrangement.share).toBe(1 - MIN_SHARE)
    expect(moveDivider(moved, 300, 0)).toBe(moved)
    expect(split(unsplit(moved)).arrangement.share).toBe(0.3)
    expect(evenDivider(moved).arrangement.share).toBe(EVEN_SHARE)
    expect(evenDivider(ws)).toBe(ws)
  })
})
