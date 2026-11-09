// ミニマップ: 紙の範囲の計算（base/minimap/geometry.ts）・
// ページの絵（base/minimap/marks.ts と、形・線の定義の minimap）
import { describe, expect, test } from "bun:test"
import type { ItemPage } from "../../../web/src/core/placed"
import type { Book } from "../../../web/src/core/schema/book"
import { fitScale, grabAt, panFor, seenRect } from "../../../web/src/plugins/base/minimap/geometry"
import { minimapMarks } from "../../../web/src/plugins/base/minimap/marks"
import { CORE_CATALOG } from "../../support"

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
  // タイプ type のブックの 1 枚だけのページ page の絵
  const marksOf = (type: string, page: ItemPage) =>
    minimapMarks(CORE_CATALOG, { id: "b1", type, pages: [page] } as unknown as Book, page)

  test("線を先に（下に）、形をあとに描く。形は定義の輪郭、定義の無い形は置いた四角", () => {
    const marks = marksOf(
      "@matomezu/drawing:drawing",
      page([
        { id: "a", item: "@matomezu/shape:shape-diamond", x: 100, y: 100, w: 120, h: 60, props: { caption: "" } },
        { id: "b", item: "@matomezu/box:shape-nest-box", x: 400, y: 100, w: 100, h: 60, props: {} },
        { id: "c", item: "@matomezu/shape:shape-circle", x: 100, y: 300, w: 80, h: 80, props: { caption: "" } },
        { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: { route: "straight" } },
        { id: "z", item: "@other:gone", x: 600, y: 300, w: 40, h: 30, props: {} },
      ] as ItemPage["items"]),
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
    const [up, turned] = marksOf(
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
    )
    expect(up?.kind).toBe("polygon")
    expect(turned?.kind).toBe("polygon")
    expect(up).not.toEqual(turned)
  })
})

test("アイテムを置かないツリーのページは、見せ方の minimap が節を四角で、線を両端を結ぶ線で描く", () => {
  const tree = {
    id: "p1",
    title: "",
    paper: "@matomezu/base:a4",
    orientation: "landscape",
    items: [],
    root: { id: "r", caption: "根", children: [{ id: "a", caption: "子" }] },
  } as ItemPage
  const marks = minimapMarks(
    CORE_CATALOG,
    { id: "b1", type: "@matomezu/tree:tree", pages: [tree] } as unknown as Book,
    tree,
  )
  expect(marks.map(m => m.kind)).toEqual(["polyline", "rect", "rect"])
})

// 箱 1 つのページを、タイプ type のブックで描いた絵
const oneBox = (type: string) => {
  const box = { id: "a", item: "@matomezu/box:shape-nest-box", x: 100, y: 100, w: 100, h: 60, props: {} }
  const page = {
    id: "p1",
    title: "",
    paper: "@matomezu/base:a4",
    orientation: "landscape",
    items: [box],
  } as unknown as ItemPage
  return minimapMarks(CORE_CATALOG, { id: "b1", type, pages: [page] } as unknown as Book, page)
}

test("紙の見せ方は、置いたアイテムを描く", () => {
  expect(oneBox("@matomezu/drawing:drawing")).toEqual([{ kind: "rect", x: 100, y: 100, w: 100, h: 60 }])
})

test("minimap の無い見せ方（マークダウン）は、何も描かない", () => {
  expect(oneBox("@matomezu/markdown:markdown")).toEqual([])
})
