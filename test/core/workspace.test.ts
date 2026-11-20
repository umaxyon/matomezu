import { describe, expect, test } from "bun:test"
import { openedPage, panBy, select, setEditing, shownPageId } from "../../web/src/core/stage"
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
  NO_STAGES_LEFT,
  newWorkspace,
  setTool,
  showPage,
  split,
  toolOf,
  unsplit,
} from "../../web/src/core/workspace"
import { drawingPage, testBook } from "../lineup"
import { CORE_CATALOG } from "../support"

describe("workspace", () => {
  const p1 = drawingPage("p1")
  const p2 = drawingPage("p2", { title: "ページ 2" })
  const book = testBook("b1", "見本", [p1, p2])
  const ws = newWorkspace(CORE_CATALOG, book)

  test("分けると、カレントの右に何も開いていないステージが増え、カレントは変わらない", () => {
    const two = split(ws, "s2")
    expect(two.stages.map(s => s.id)).toEqual(["s1", "s2"])
    expect(two.stages[1]!.opened).toBeNull()
    expect(two.current).toBe("s1")
  })

  test("上限より多くは分けない", () => {
    let w = ws
    for (let i = 0; i < MAX_STAGES + 2; i++) w = split(w, `s${i + 2}`)
    expect(w.stages).toHaveLength(MAX_STAGES)
  })

  test("分けるのをやめると、カレントのステージだけが残る", () => {
    const two = focus(split(ws, "s2"), "s2")
    const one = unsplit(two)
    expect(one.stages.map(s => s.id)).toEqual(["s2"])
    expect(one.current).toBe("s2")
  })

  test("ページを開くのも、ずらすのも、そのステージだけが変わり、ほかは同じものを使い回す", () => {
    const two = split(ws, "s2")
    const opened = showPage(CORE_CATALOG, two, "s1", book, "p2")
    expect(currentStage(opened).opened).toMatchObject({ page: "p2" })
    expect(opened.stages[1]).toBe(two.stages[1]!)
    const panned = mapStage(two, "s1", s => panBy(s, -10, -20))
    expect(panned.stages[0]!.pan).toEqual({ x: -10, y: -20 })
    expect(panned.stages[1]).toBe(two.stages[1]!)
  })

  test("ステージを閉じると、残りのステージだけになる。カレントを閉じたら残りがカレント", () => {
    const two = focus(split(ws, "s2"), "s2")
    expect(close(two, "s1")).toMatchObject({ stages: [{ id: "s2" }], current: "s2" })
    const left = close(two, "s2")
    expect(left).toMatchObject({ stages: [{ id: "s1" }], current: "s1" })
    expect(close(focus(two, "s1"), "s1").current).toBe("s2")
  })

  test("ステージの id は使い回さない。閉じたあとに分けても、新しい番号を振る", () => {
    const reopened = split(close(split(ws, "s2"), "s1"), "s3")
    expect(reopened.stages.map(s => s.id)).toEqual(["s2", "s3"])
    expect(split(close(reopened, "s3"), "s4").stages.map(s => s.id)).toEqual(["s2", "s4"])
  })

  test("変わらない操作は同じ値を返す", () => {
    expect(close(ws, "s1")).toBe(ws)
    expect(close(split(ws, "s2"), "nope").stages).toHaveLength(2)
    expect(focus(ws, "s1")).toBe(ws)
    expect(focus(ws, "nope")).toBe(ws)
    expect(unsplit(ws)).toBe(ws)
    expect(mapStage(ws, "s1", s => panBy(s, 0, 0))).toBe(ws)
  })

  test("ブックが変わると、開いているステージを合わせる。開いていたページが無くなれば最初のページ、紙が変われば紙を決め直す", () => {
    const two = showPage(CORE_CATALOG, split(ws, "s2"), "s1", book, "p2")
    const both = mapStage(two, "s2", s => ({ ...s, opened: two.stages[0]!.opened }))
    const removed = { ...book, lineup: [p1] }
    expect(followBook(CORE_CATALOG, both, removed).stages.map(s => shownPageId(s.opened ?? null))).toEqual(["p1", "p1"])
    const a3 = { ...book, lineup: [p1, { ...p2, paper: "@matomezu/base:a3" }] }
    expect(openedPage(followBook(CORE_CATALOG, both, a3).stages[0]!.opened ?? null)?.paper).toMatchObject({
      status: "known",
      size: { w: 1587, h: 1123 },
    })
    expect(followBook(CORE_CATALOG, both, book)).toBe(both)
  })

  test("変わる前のブックを渡すと、開いていたページが無くなったときは隣のページ（後ろ、無ければ前）を開く", () => {
    const page = (id: string) => ({ ...p1, id })
    const three = { ...book, lineup: [page("p1"), page("p2"), page("p3")] }
    const at = (id: string) => showPage(CORE_CATALOG, ws, "s1", three, id)
    const without = (id: string) => ({ ...three, lineup: three.lineup.filter(p => p.id !== id) })
    expect(shownPageId(followBook(CORE_CATALOG, at("p2"), without("p2"), three).stages[0]!.opened ?? null)).toBe("p3")
    expect(shownPageId(followBook(CORE_CATALOG, at("p3"), without("p3"), three).stages[0]!.opened ?? null)).toBe("p2")
    expect(
      shownPageId(followBook(CORE_CATALOG, at("p1"), { ...three, lineup: [] }, three).stages[0]!.opened ?? null),
    ).toBeNull()
  })

  test("ブックの一覧が変わると、無くなったブックを開いていたステージは閉じる。1 つも残らなければ NO_STAGES_LEFT", () => {
    const two = split(ws, "s2")
    const left = followLibrary(CORE_CATALOG, two, {})
    expect(left === NO_STAGES_LEFT ? left : left.stages.map(s => s.opened)).toEqual([null])
    expect(followLibrary(CORE_CATALOG, ws, {})).toBe(NO_STAGES_LEFT)
    expect(followLibrary(CORE_CATALOG, two, { b1: book })).toBe(two)
  })

  test("境目を動かすと左の幅の割合が変わり、端には寄り切らない。分割をやめても覚えていて、真ん中に戻せる", () => {
    const moved = moveDivider(split(ws, "s2"), 300, 1000)
    expect(moved.arrangement.share).toBe(0.3)
    expect(moveDivider(moved, 0, 1000).arrangement.share).toBe(MIN_SHARE)
    expect(moveDivider(moved, 1000, 1000).arrangement.share).toBe(1 - MIN_SHARE)
    expect(moveDivider(moved, 300, 0)).toBe(moved)
    expect(split(unsplit(moved), "s3").arrangement.share).toBe(0.3)
    expect(evenDivider(moved).arrangement.share).toBe(EVEN_SHARE)
    expect(evenDivider(ws)).toBe(ws)
  })

  describe("その場の編集と、認可ステップで替わる道具", () => {
    const box = { id: "a", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: "a", body: "" } }
    const open = testBook("b2", "箱", [drawingPage("q1", { items: [box] })])
    const locked = { ...open, locked: true as const }
    // 付け替えの道具（行うアクションがあり、ロックで止められる）で、箱をその場で編集している
    const reparenting = setTool(CORE_CATALOG, newWorkspace(CORE_CATALOG, open), "s1", "@matomezu/paper:reparent")
    const editing = mapStage(reparenting, "s1", s => setEditing(select(s, ["a"]), true))
    const stage = (w: ReturnType<typeof newWorkspace>) => w.stages[0]!

    test("ロックで今の道具が使えなくなり組の次の道具になると、その場の編集を終える", () => {
      expect(toolOf(CORE_CATALOG, editing, "s1", { b2: open })).not.toBe(
        toolOf(CORE_CATALOG, editing, "s1", { b2: locked }),
      )
      const after = followBook(CORE_CATALOG, editing, locked, open)
      expect(stage(after).editing).toBe(false)
      expect(stage(after).selection).toEqual(["a"])
    })

    test("道具が替わらなければ、その場の編集は続く", () => {
      const renamed = { ...open, title: "箱 2" }
      expect(stage(followBook(CORE_CATALOG, editing, renamed, open)).editing).toBe(true)
    })

    test("ブックの一覧が変わったときも、道具が替われば、その場の編集を終える", () => {
      const after = followLibrary(CORE_CATALOG, editing, { b2: locked }, { b2: open })
      expect(after).not.toBe(NO_STAGES_LEFT)
      expect(stage(after as ReturnType<typeof newWorkspace>).editing).toBe(false)
    })
  })
})
