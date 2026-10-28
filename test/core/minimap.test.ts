// ミニマップ: 開閉の決まり（core/stage.ts の scrolls・setMinimap・showPickerMap）・紙の範囲の計算（base/minimap/geometry.ts）・
// ページの絵（base/minimap/marks.ts と、形・線の定義の minimap）
import { describe, expect, test } from "bun:test"
import type { ItemPage } from "../../web/src/core/placed"
import {
  closePicker,
  newStage,
  openBook,
  openPage,
  openPicker,
  panBy,
  resize,
  scrolls,
  setMinimap,
  showPickerMap,
} from "../../web/src/core/stage"
import { fitScale, grabAt, panFor, seenRect } from "../../web/src/plugins/base/minimap/geometry"
import { minimapMarks } from "../../web/src/plugins/base/minimap/marks"
import { leftBox, mapPlace, mapSlot, pickerSlots } from "../../web/src/plugins/base/tool-picker/layout"
import { CORE_CATALOG } from "../support"

const paged = {
  type: "@matomezu/drawing:drawing" as const,
  id: "b1",
  title: "見本",
  pages: [
    { id: "p1", title: "大きい", paper: "@matomezu/base:a4", orientation: "landscape" as const },
    { id: "p2", title: "小さい", paper: "@matomezu/base:a5", orientation: "landscape" as const },
  ],
}
const opened = openBook(CORE_CATALOG, newStage("s1"), paged)
const small = resize(opened, { w: 400, h: 300 }) // 紙（A4 横）が収まらない
const wide = { w: 3000, h: 3000 } // どの紙も収まる

describe("開閉", () => {
  test("紙が表示領域に収まらないときだけ、ずらして見る所がある（余白は数えない。測る前は無い）", () => {
    expect(scrolls(opened)).toBe(false)
    expect(scrolls(small)).toBe(true)
    expect(scrolls(resize(opened, wide))).toBe(false)
    expect(scrolls(newStage("s2"))).toBe(false)
  })

  test("収まっていれば開かない。開いたあと収まると閉じ、また収まらなくなっても自分では開かない", () => {
    expect(setMinimap(resize(opened, wide), true).minimap).toBe(false)
    const open = setMinimap(small, true)
    expect(open.minimap).toBe(true)
    expect(setMinimap(open, false).minimap).toBe(false)
    const fit = resize(open, wide)
    expect(fit.minimap).toBe(false)
    expect(resize(fit, { w: 400, h: 300 }).minimap).toBe(false)
  })

  test("小さい紙のページを開いて収まれば閉じる。ずらしても開いたまま", () => {
    const open = setMinimap(small, true)
    expect(panBy(open, -50, -50).minimap).toBe(true)
    const roomy = resize(open, { w: 1000, h: 800 })
    expect(roomy.minimap).toBe(true)
    expect(openPage(CORE_CATALOG, roomy, paged, "p2").minimap).toBe(false)
  })

  test("道具のアイコンをミニマップに替える（開いていなければ何もしない）。閉じればアイコンも消える", () => {
    expect(showPickerMap(small)).toBe(small)
    const picked = openPicker(small, { x: 10, y: 20 })
    expect(picked.picker).toEqual({ at: { x: 10, y: 20 }, map: false })
    const map = showPickerMap(picked)
    expect(map.picker).toEqual({ at: { x: 10, y: 20 }, map: true })
    expect(showPickerMap(map)).toBe(map)
    expect(closePicker(map).picker).toBeNull()
  })
})

describe("紙の範囲の計算", () => {
  const paper = { w: 1000, h: 800 }
  test("見えている紙の範囲（紙の外は切る）", () => {
    // ずらす量 0 は、表示領域の左上から余白の分だけ内側に紙の左上
    expect(seenRect(paper, { w: 400, h: 300 }, { x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0, w: 312, h: 212 })
    expect(seenRect(paper, { w: 400, h: 300 }, panFor({ x: 200, y: 100 }, 1), 1)).toEqual({
      x: 200,
      y: 100,
      w: 400,
      h: 300,
    })
    expect(seenRect(paper, { w: 400, h: 300 }, panFor({ x: 200, y: 100 }, 2), 2)).toEqual({
      x: 200,
      y: 100,
      w: 200,
      h: 150,
    })
    expect(seenRect(paper, { w: 400, h: 300 }, panFor({ x: 900, y: 0 }, 1), 1)).toEqual({
      x: 900,
      y: 0,
      w: 100,
      h: 300,
    })
    expect(seenRect(paper, { w: 400, h: 300 }, panFor({ x: 2000, y: 0 }, 1), 1)).toBeNull()
  })
  test("見えている範囲の中を押せばそのままつかみ、外を押せばそこが真ん中に来る所へ飛んでつかむ", () => {
    const seen = { x: 100, y: 100, w: 200, h: 100 }
    expect(grabAt(seen, { x: 150, y: 120 })).toEqual({ to: null, grab: { x: 50, y: 20 } })
    expect(grabAt(seen, { x: 600, y: 500 })).toEqual({ to: { x: 500, y: 450 }, grab: { x: 100, y: 50 } })
  })
  test("紙を収める倍率は、幅と高さのきつい方", () => {
    expect(fitScale(paper, 200, 400)).toBe(0.2)
    expect(fitScale(paper, 400, 80)).toBe(0.1)
  })
})

describe("ページの絵", () => {
  const page = (items: ItemPage["items"]): ItemPage => ({
    id: "p1",
    title: "",
    paper: "@matomezu/base:a4",
    orientation: "landscape",
    items,
  })
  const setting = () => undefined

  test("線を先に（下に）、形をあとに描く。形は定義の輪郭、定義の無い形は置いた四角", () => {
    const marks = minimapMarks(
      CORE_CATALOG,
      "@matomezu/drawing:drawing",
      page([
        { id: "a", item: "@matomezu/shape:shape-diamond", x: 100, y: 100, w: 120, h: 60, props: { caption: "" } },
        { id: "b", item: "@matomezu/box:shape-nest-box", x: 400, y: 100, w: 100, h: 60, props: {} },
        { id: "c", item: "@matomezu/shape:shape-circle", x: 100, y: 300, w: 80, h: 80, props: { caption: "" } },
        { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: { route: "straight" } },
        { id: "z", item: "@other:gone", x: 600, y: 300, w: 40, h: 30, props: {} },
      ] as ItemPage["items"]),
      setting,
    )
    expect(marks.map(m => m.kind)).toEqual(["polyline", "polygon", "rect", "ellipse", "rect"])
    expect(marks[1]).toEqual({
      kind: "polygon",
      points: [
        { x: 160, y: 100 },
        { x: 220, y: 130 },
        { x: 160, y: 160 },
        { x: 100, y: 130 },
      ],
    })
    expect(marks[2]).toEqual({ kind: "rect", x: 400, y: 100, w: 100, h: 60 })
    expect(marks[3]).toEqual({ kind: "ellipse", x: 100, y: 300, w: 80, h: 80 })
    expect(marks[4]).toEqual({ kind: "rect", x: 600, y: 300, w: 40, h: 30 })
    // 線はひし形の右の頂点から箱の左の辺へ
    expect(marks[0]).toEqual({
      kind: "polyline",
      points: [
        { x: 220, y: 130 },
        { x: 400, y: 130 },
      ],
    })
  })

  test("横向きの台形は、回した輪郭で描く", () => {
    const [up, turned] = minimapMarks(
      CORE_CATALOG,
      "@matomezu/drawing:drawing",
      page([
        {
          id: "a",
          item: "@matomezu/shape:shape-trapezoid",
          x: 0,
          y: 0,
          w: 120,
          h: 60,
          props: { caption: "", captionAlign: "center", turned: false },
        },
        {
          id: "b",
          item: "@matomezu/shape:shape-trapezoid",
          x: 0,
          y: 0,
          w: 60,
          h: 120,
          props: { caption: "", captionAlign: "center", turned: true },
        },
      ] as ItemPage["items"]),
      setting,
    )
    expect(up?.kind).toBe("polygon")
    expect(turned?.kind).toBe("polygon")
    expect(up).not.toEqual(turned)
  })
})

describe("右の長押しのミニマップの置き場所", () => {
  const view = { w: 1200, h: 800 }
  test("ミニマップのボタンは、並びの外側の真ん中のアイコンの隣", () => {
    const at = { x: 600, y: 400 }
    const row = pickerSlots(at, 3, view)
    const mid = row.slots[1]!
    expect(mapSlot(row, at)).toEqual({ x: mid.x, y: mid.y - 46 })
    const low = pickerSlots({ x: 600, y: 20 }, 3, view) // 上に入らなければ下に並び、ボタンはさらに下
    expect(mapSlot(low, { x: 600, y: 20 }).y).toBeGreaterThan(low.slots[1]!.y)
  })
  test("アイコンが偶数なら、ボタンは真ん中の 2 つの間", () => {
    const at = { x: 600, y: 400 }
    const two = pickerSlots(at, 2, view)
    expect(mapSlot(two, at).x).toBe((two.slots[0]!.x + two.slots[1]!.x) / 2)
    const edge = { x: 1190, y: 400 }
    const left = pickerSlots(edge, 2, view)
    expect(mapSlot(left, edge).y).toBe((left.slots[0]!.y + left.slots[1]!.y) / 2)
  })
  test("並びがあった所から、ポインタと反対の側へ広げ、画面からはみ出すなら内へ寄せる", () => {
    const at = { x: 600, y: 400 }
    const row = pickerSlots(at, 3, view)
    const size = { w: 250, h: 200 }
    const p = mapPlace(row, at, size, view)
    expect(p.y + size.h).toBe(Math.max(...row.slots.map(s => s.y)) + 40) // 下の辺を並びの下の辺にそろえ、上へ広げる
    expect(p.x + size.w / 2).toBeCloseTo(at.x, 0)
    const edge = { x: 1190, y: 400 }
    const left = pickerSlots(edge, 3, view)
    expect(mapPlace(left, edge, size, view).x + size.w).toBeLessThanOrEqual(view.w - 6)
  })
})

test("その場に出したミニマップは、枠から 80px より離れるか、ポインタから見て向こう側へ 40px より通り過ぎると離れた", () => {
  const box = { x: 100, y: 100, w: 200, h: 150 } // ポインタ (200, 300) の上に広げた
  const at = { x: 200, y: 300 }
  expect(leftBox(box, "row", at, { x: 150, y: 150 })).toBe(false)
  expect(leftBox(box, "row", at, { x: 200, y: 320 })).toBe(false)
  expect(leftBox(box, "row", at, { x: 200, y: 340 })).toBe(true)
  expect(leftBox(box, "row", at, { x: 200, y: 59 })).toBe(true)
  expect(leftBox(box, "row", at, { x: 370, y: 150 })).toBe(false)
  expect(leftBox(box, "row", at, { x: 390, y: 150 })).toBe(true)
})

test("アイテムを置かないツリーのページは、タイプの minimap が節を四角で、線を両端を結ぶ線で描く", () => {
  const tree = {
    id: "p1",
    title: "",
    paper: "@matomezu/base:a4",
    orientation: "landscape",
    items: [],
    root: { id: "r", caption: "根", children: [{ id: "a", caption: "子" }] },
  } as ItemPage
  const marks = minimapMarks(CORE_CATALOG, "@matomezu/tree:tree", tree, () => undefined)
  expect(marks.map(m => m.kind)).toEqual(["polyline", "rect", "rect"])
})
