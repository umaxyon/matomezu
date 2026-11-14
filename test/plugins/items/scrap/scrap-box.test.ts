// スクラップボックス（@matomezu/scrap:shape-scrap-box）: スクラップトレイのスクラップの値を持って置こうとし、紙を押すと、追加のダイアログ無しでその値のまま置く。
// 大きさは見る範囲 × 倍率。置いたあともスクラップトレイのスクラップは変わらず、元に戻すと置いた形だけが消える
import { expect, test } from "bun:test"
import type { Point } from "../../../../web/src/core/geom"
import type { PlacedShape } from "../../../../web/src/core/placed"
import type { BookOf } from "../../../../web/src/core/schema/book"
import { placement } from "../../../../web/src/core/stage"
import { screenOf } from "../../../../web/src/core/window"
import { type Edges, placedSize, resizedBy } from "../../../../web/src/plugins/base"
import { floorsOf } from "../../../../web/src/plugins/base/place/items"
import { SCRAP } from "../../../../web/src/plugins/base/scrap/scrap"
import { SCRAP_BOX } from "../../../../web/src/plugins/items/scrap"
import { lineColor } from "../../../../web/src/plugins/items/scrap/ScrapBoxView"
import { PLACE_OFFSET, placingShape } from "../../../../web/src/plugins/paper/placing/items"
import { sizedStore } from "../../../support"

const BOX = SCRAP_BOX.id
const ONE = { page: "p-other", area: { x: 10, y: 20, w: 400, h: 200 }, scale: 0.5 }

function pointerFor(store: ReturnType<typeof sizedStore>, at: Point): Point {
  const p = placement(screenOf(store.state.getState().window).stages[0]!)!
  return { x: p.x + at.x * p.zoom + PLACE_OFFSET.x, y: p.y + at.y * p.zoom + PLACE_OFFSET.y }
}
const items = (store: ReturnType<typeof sizedStore>) =>
  (store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!.items ?? []
const tray = (store: ReturnType<typeof sizedStore>) => Object.values(store.state.getState().records[SCRAP.id] ?? {})

test("置こうとしている間の影の大きさは、渡した値の見る範囲 × 倍率（値が無ければアイテムの既定）", () => {
  const store = sizedStore()
  const catalog = store.catalog.core
  expect(placedSize(catalog, placingShape(catalog, BOX, ONE)!)).toEqual({ w: 200, h: 100 })
  expect(placingShape(catalog, BOX)).toBeNull() // スクラップの値が無ければ置けない
})

test("スクラップトレイのスクラップの値で置こうとして紙を押すと、ダイアログ無しでその値のまま置き、スクラップトレイは変わらない。元に戻すと置いた形だけが消える", () => {
  const store = sizedStore()
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean }
  expect(perform("@matomezu/base:scrap-cut", ONE).ok).toBe(true)
  const before = tray(store)
  store.actions.togglePlacing("s1", BOX, ONE)
  expect(store.actions.command("s1", "@matomezu/paper:paper-place", pointerFor(store, { x: 100, y: 50 }))).toBe(true)
  expect(store.state.getState().dialog).toBeNull()
  expect(items(store)).toHaveLength(1)
  expect(items(store)[0]).toMatchObject({ item: BOX, x: 100, y: 50, props: ONE })
  expect(screenOf(store.state.getState().window).stages[0]!.placing).toBeNull()
  expect(tray(store)).toEqual(before)
  store.actions.command("s1", "@matomezu/base:undo")
  expect(items(store)).toHaveLength(0)
  expect(tray(store)).toEqual(before)
})

test("枠線 line は省ける: 無ければテーマの線の色、none なら引かない、色ならその色。ほかの値は項目の形に合わない", () => {
  expect(SCRAP_BOX.props.parse(ONE)).toEqual(ONE) // スクラップの値だけで項目になる（スクラップトレイから置ける）
  expect(SCRAP_BOX.props.safeParse({ ...ONE, line: "none" }).success).toBe(true)
  expect(SCRAP_BOX.props.safeParse({ ...ONE, line: "#336699" }).success).toBe(true)
  expect(SCRAP_BOX.props.safeParse({ ...ONE, line: "red" }).success).toBe(false)
  expect(lineColor(undefined)).toBe("var(--scrap-line)")
  expect(lineColor("none")).toBeNull()
  expect(lineColor("#336699")).toBe("#336699")
})

// ONE（200 × 100）を紙の (100, 50) に置いたストアと、そのページ
function placedOne() {
  const store = sizedStore()
  store.actions.togglePlacing("s1", BOX, ONE)
  store.actions.command("s1", "@matomezu/paper:paper-place", pointerFor(store, { x: 100, y: 50 }))
  const page = () => (store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!
  const box = () => page().items![0] as PlacedShape
  const resize = (args: object) =>
    (store.actions.perform as (id: string, args: unknown, on: unknown) => { ok: boolean })(
      "@matomezu/paper:item-resize",
      { page: page().id, item: box().id, ...args },
      { book: "b1" },
    )
  return { store, page, box, resize }
}

test("item-resize は、スクラップボックスの幅を倍率に写す（高さは比で決まり、h は使わない。w・h は書かない）。倍率の取れる範囲の外は断る", () => {
  const { store, box, resize } = placedOne()
  expect(resize({ w: 400, h: 999 }).ok).toBe(true)
  expect(box().props).toEqual({ ...ONE, scale: 1 })
  expect([box().w, box().h]).toEqual([undefined, undefined])
  expect(placedSize(store.catalog.core, box())).toEqual({ w: 400, h: 200 })
  expect(resize({ w: 30 }).ok).toBe(false) // 倍率 0.075 は下限 0.1 より小さい
  expect(box().props).toEqual({ ...ONE, scale: 1 })
})

test("角をつかむと、向かいの角を止めて比を保つ。紙の端で止まり、辺はつかめない", () => {
  const { store, box } = placedOne()
  const catalog = store.catalog.core
  const paper = { w: 1123, h: 794 }
  const by = (edges: Edges, d: Point) => resizedBy(catalog, box(), edges, d, paper, true)
  expect(by({ x: "right", y: "bottom" }, { x: 100, y: 0 })).toEqual({ x: 100, y: 50, w: 300, h: 150 })
  expect(by({ x: "left", y: "top" }, { x: -100, y: 0 })).toEqual({ x: 0, y: 0, w: 300, h: 150 })
  // 右下へ大きく引いても、紙の右の端（1123 - 100）まで
  expect(by({ x: "right", y: "bottom" }, { x: 5000, y: 5000 })).toMatchObject({ x: 100, y: 50, w: 1023 })
  // 小さく引いても、一番小さい大きさ（高さ 24）まで
  expect(by({ x: "right", y: "bottom" }, { x: -5000, y: -5000 })).toEqual({ x: 100, y: 50, w: 48, h: 24 })
  expect(by({ x: "right" }, { x: 100, y: 0 })).toBeNull()
})

test("スクラップボックスは、押されても縮まない（縮めてよい下限が今の大きさ）", () => {
  const { store, page, box } = placedOne()
  expect(floorsOf(store.catalog.core, page()).get(box().id)).toEqual({ w: 200, h: 100 })
})
