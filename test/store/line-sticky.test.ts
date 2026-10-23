// 前の辺に留まる線の選び方（drawing/line/sticky.ts）と、線の編集のダイアログで変える項目（edit.ts の linePatch）
import { expect, test } from "bun:test"
import type { Rect } from "../../web/src/core/geom"
import { linePatch } from "../../web/src/plugins/items/line/edit"
import type { PlacedLine } from "../../web/src/plugins/items/line/placed"
import type { EndMemory } from "../../web/src/plugins/items/line/route"
import { type StickyScene, stickyMemory } from "../../web/src/plugins/items/line/sticky"

const r = (x: number, y = 100): Rect => ({ x, y, w: 100, h: 64 })
const line = (id: string, from: string, to: string, props: PlacedLine["props"] = {}): PlacedLine => ({
  id,
  item: "connector.line",
  from,
  to,
  props,
})
const mem: EndMemory = { exit: { side: "r", at: 0.5 }, enter: { side: "l", at: 0.5 } }
const rects = new Map([
  ["a", r(100)],
  ["b", r(400)],
  ["c", r(700)],
])
const scene = (o: Partial<StickyScene>): StickyScene => ({
  lines: [line("ab", "a", "b"), line("bc", "b", "c")],
  memo: new Map([
    ["ab", mem],
    ["bc", mem],
  ]),
  before: rects,
  rects,
  dragged: [],
  pushed: [],
  swapped: false,
  settle: new Set(),
  ...o,
})
const ids = (m: Map<string, EndMemory>) => [...m.keys()]

test("何も動いていなければ、記憶のある線は全部留まる。記憶の無い線は渡さない", () => {
  expect(ids(stickyMemory(scene({})))).toEqual(["ab", "bc"])
  expect(ids(stickyMemory(scene({ memo: new Map([["ab", mem]]) })))).toEqual(["ab"])
})

test("A1: 動かしている形の線は留まる。A2・A3: 入れ替えが起きたら、動かしている形の線は留まらない", () => {
  const moving = new Map([...rects, ["a", r(150)]])
  expect(ids(stickyMemory(scene({ rects: moving, dragged: ["a"] })))).toEqual(["ab", "bc"])
  expect(ids(stickyMemory(scene({ rects: moving, dragged: ["a"], swapped: true })))).toEqual(["bc"])
})

test("A5: 入れ替えでずれて描いている形の線は留まらない", () => {
  expect(ids(stickyMemory(scene({ dragged: ["a"], pushed: ["c"] })))).toEqual(["ab"])
})

test("D1: ドラッグのほかで動いた・大きさが変わった形の線は留まらない。A4: 離したあとに付け替えを見る線は、形が動いていても記憶を渡す", () => {
  const movedC = new Map([...rects, ["c", r(720)]])
  expect(ids(stickyMemory(scene({ rects: movedC })))).toEqual(["ab"])
  const resizedB = new Map([...rects, ["b", { ...r(400), w: 140 }]])
  expect(ids(stickyMemory(scene({ rects: resizedB })))).toEqual([])
  expect(ids(stickyMemory(scene({ rects: movedC, settle: new Set(["bc"]) })))).toEqual(["ab", "bc"])
})

test("linePatch: 変えた項目だけを返し、消すものは null。自分に戻る線の通り方は変えない", () => {
  const l = line("l", "a", "b", { dash: "dashed", endHead: "arrow", caption: "申請" })
  const none = new Set<never>()
  const same = {
    caption: "申請",
    route: "elbow" as const,
    dash: "dashed" as const,
    startHead: "" as const,
    endHead: "arrow" as const,
    once: none,
  }
  expect(linePatch(l, same, rects, true)).toEqual({})
  expect(
    linePatch(l, { ...same, caption: " ", dash: "solid", endHead: "", startHead: "diamond" }, rects, true),
  ).toEqual({
    caption: null,
    dash: null,
    endHead: null,
    startHead: "diamond",
  })
  expect(linePatch(l, { ...same, route: "straight" }, rects, true)).toEqual({ route: "straight" })
  expect(
    linePatch(
      line("s", "a", "a"),
      { ...same, caption: "", dash: "solid", endHead: "", route: "straight" },
      rects,
      true,
    ),
  ).toEqual({})
})

test("linePatch: 接辺の自動選択は両端と区間を消し、整列は両端の位置を決めて区間を消す", () => {
  const l = line("l", "a", "b", { exitAt: 0.1, enterAt: 0.9, via: [300] })
  const base = {
    caption: "",
    route: "elbow" as const,
    dash: "solid" as const,
    startHead: "" as const,
    endHead: "" as const,
  }
  expect(linePatch(l, { ...base, once: new Set(["free"]) }, rects, true)).toEqual({
    exitAt: null,
    enterAt: null,
    via: null,
  })
  const aligned = linePatch(l, { ...base, once: new Set(["align"]) }, rects, true)
  expect(aligned.via).toBeNull()
  expect(typeof aligned.exitAt).toBe("number")
  expect(typeof aligned.enterAt).toBe("number")
  expect(linePatch(l, { ...base, once: new Set(["caption"]) }, rects, true)).toEqual({
    captionAt: null,
    captionOffset: null,
  })
})
