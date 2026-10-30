// 子の形のアクション: 親を渡して置く・子を動かす・変える・大きさを変える・子孫ごと消す・付け替え（紙のプラグインの item-*）
import { expect, test } from "bun:test"
import { findShape, type ItemPage, walkShapes } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { childOrigin } from "../../web/src/plugins/base/place/frame"
import { NEST_PADDING, placedSize, portAreasOf } from "../../web/src/plugins/base/place/placed"
import { targetsFrom } from "../../web/src/plugins/items/line/connect"
import { routeInputOf } from "../../web/src/plugins/items/line/drawn"
import { dropTarget } from "../../web/src/plugins/paper/placing/items"
import { CORE_CATALOG, newStore } from "../support"

const NEST = "@matomezu/box:shape-nest-box"
const LIST = "@matomezu/list:shape-list"

const page = (store: ReturnType<typeof newStore>) =>
  (store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0] as unknown as ItemPage
const run = (store: ReturnType<typeof newStore>, action: string, args: object) =>
  store.actions.perform(action as never, { page: "p1", ...args } as never, { book: "b1" })
const place = (store: ReturnType<typeof newStore>, args: object) => {
  const done = run(store, "@matomezu/paper:item-place", { item: NEST, w: 200, h: 100, ...args })
  return done.ok ? (done.result as { item: string }).item : null
}
const at = (store: ReturnType<typeof newStore>, id: string) => findShape(page(store), id)
const ids = (store: ReturnType<typeof newStore>) => walkShapes(page(store)).map(s => [s.shape.id, s.parent])

// 何も書いていない内包ボックスの子の領域の左上（親の左上から。キャプション 1 行の下）
const O = childOrigin(CORE_CATALOG, { id: "x", x: 0, y: 0, item: NEST, props: { caption: "", body: "" } } as never)

test("親を渡して置くと、親の子の並びの末尾に、親の左上からの位置で入る。子の子も置ける", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const b = place(store, { at: { x: 20, y: 60 }, parent: a, w: 200, h: 150 })!
  const c = place(store, { at: { x: 20, y: 60 }, parent: b, w: 64, h: 40 })!
  expect(ids(store)).toEqual([
    [a, null],
    [b, a],
    [c, b],
  ])
  expect(at(store, c)?.at).toEqual({ x: 40, y: 120 })
})

test("子の領域より左や上（キャプションの所など）に置くと、子の領域の左上へ寄せる。子を持てない形・無い親には置けない", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 } })!
  const list = run(store, "@matomezu/paper:item-place", { item: LIST, at: { x: 400, y: 0 } })
  const l = (list as { result: { item: string } }).result.item
  const b = place(store, { at: { x: -5, y: 0 }, parent: a, w: 80, h: 40 })!
  expect(at(store, b)?.shape).toMatchObject({ x: O.x, y: O.y })
  expect(place(store, { at: { x: 0, y: 0 }, parent: l })).toBeNull()
  expect(place(store, { at: { x: 0, y: 0 }, parent: "nope" })).toBeNull()
})

test("重なる所に置いた子は、紙と同じに兄弟を右へ押す（親の中で。縮めない）", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const b = place(store, { at: { x: 20, y: 60 }, parent: a, w: 100, h: 60 })!
  place(store, { at: { x: 30, y: 60 }, parent: a, w: 100, h: 60 })
  expect(at(store, b)!.shape.x).toBeGreaterThanOrEqual(30 + 100 + 8)
  expect(at(store, b)!.shape).toMatchObject({ w: 100, h: 60 })
})

test("子が入るよう親が育ち、近づきすぎたページの形を押す", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 } })!
  const d = place(store, { at: { x: 220, y: 0 } })!
  place(store, { at: { x: 150, y: 60 }, parent: a, w: 120, h: 40 })
  const right = 150 + 120 + NEST_PADDING
  expect(at(store, d)!.at.x).toBeGreaterThanOrEqual(right + 8)
})

test("子は親の中で動かし、子の領域より左や上には動かさない。正面の兄弟とは入れ替わる。ページの形と子は一緒に動かさない", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const b = place(store, { at: { x: 20, y: 60 }, parent: a, w: 80, h: 40 })!
  const c = place(store, { at: { x: 108, y: 60 }, parent: a, w: 80, h: 40 })!
  expect(run(store, "@matomezu/paper:item-move", { items: [b], by: { x: 0, y: 100 } }).ok).toBe(true)
  expect(at(store, b)?.shape).toMatchObject({ x: 20, y: 160 })
  expect(run(store, "@matomezu/paper:item-move", { items: [b], by: { x: -100, y: 0 } }).ok).toBe(false)
  run(store, "@matomezu/paper:item-move", { items: [b], by: { x: 0, y: -100 } })
  expect(run(store, "@matomezu/paper:item-move", { items: [b], by: { x: 60, y: 0 } }).ok).toBe(true)
  expect(at(store, c)!.shape.x).toBeLessThan(at(store, b)!.shape.x)
  expect(run(store, "@matomezu/paper:item-move", { items: [a, b], by: { x: 1, y: 0 } }).ok).toBe(false)
})

test("子の項目と大きさも id で変えられ、大きくなった子は親の中で兄弟を押す", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const b = place(store, { at: { x: 20, y: 60 }, parent: a, w: 80, h: 40 })!
  const c = place(store, { at: { x: 108, y: 60 }, parent: a, w: 80, h: 40 })!
  expect(run(store, "@matomezu/paper:item-update", { item: b, props: { caption: "子" } }).ok).toBe(true)
  expect(at(store, b)?.shape.props).toMatchObject({ caption: "子" })
  expect(run(store, "@matomezu/paper:item-resize", { item: b, w: 120, h: 50 }).ok).toBe(true)
  expect(at(store, b)?.shape).toMatchObject({ w: 120, h: 50 })
  expect(at(store, c)!.shape.x).toBeGreaterThanOrEqual(20 + 120 + 8)
  expect(run(store, "@matomezu/paper:item-resize", { item: b, x: -5 }).ok).toBe(false)
})

test("親の本文が伸びて子の領域が下がると、子を並びのまま下へずらす", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 300, h: 200 })!
  const b = place(store, { at: { x: 20, y: O.y }, parent: a, w: 80, h: 40 })!
  const c = place(store, { at: { x: 20, y: O.y + 60 }, parent: a, w: 80, h: 40 })!
  const body = "一行目\n二行目\n三行目"
  expect(run(store, "@matomezu/paper:item-update", { item: a, props: { body } }).ok).toBe(true)
  const head = childOrigin(CORE_CATALOG, at(store, a)!.shape)
  expect(head.y).toBeGreaterThan(O.y)
  expect(at(store, b)!.shape.y).toBe(head.y)
  expect(at(store, c)!.shape.y - at(store, b)!.shape.y).toBe(60)
})

test("親を消すと子孫も、子孫に付いた線も消える。子だけも消せ、子が無くなった親は shapes を持たない", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 } })!
  const b = place(store, { at: { x: 10, y: 10 }, parent: a, w: 160, h: 100 })!
  const c = place(store, { at: { x: 5, y: 5 }, parent: b, w: 64, h: 40 })!
  const d = place(store, { at: { x: 400, y: 0 } })!
  expect(run(store, "@matomezu/line:line-connect", { from: c, to: d }).ok).toBe(true)
  expect(run(store, "@matomezu/paper:item-remove", { items: [c] }).ok).toBe(true)
  expect(ids(store)).toEqual([
    [a, null],
    [b, a],
    [d, null],
  ])
  expect(at(store, b)?.shape).not.toHaveProperty("shapes")
  expect(page(store).items?.some(i => !("x" in i))).toBe(false)
  expect(run(store, "@matomezu/paper:item-remove", { items: [a, b] }).ok).toBe(true)
  expect(ids(store)).toEqual([[d, null]])
})

test("付け替えは紙の上の位置を変えずに中へ入れ・ページへ出し、つながる線は残る", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 200 })!
  const b = place(store, { at: { x: 500, y: 100 }, w: 80, h: 40 })!
  const d = place(store, { at: { x: 500, y: 400 }, w: 80, h: 40 })!
  expect(run(store, "@matomezu/line:line-connect", { from: b, to: d }).ok).toBe(true)
  expect(run(store, "@matomezu/paper:item-reparent", { item: b, parent: a }).ok).toBe(true)
  expect(at(store, b)).toMatchObject({ parent: a, at: { x: 500, y: 100 }, shape: { x: 500, y: 100 } })
  expect(page(store).items?.filter(i => !("x" in i))).toHaveLength(1)
  expect(run(store, "@matomezu/paper:item-reparent", { item: b, parent: null }).ok).toBe(true)
  expect(at(store, b)).toMatchObject({ parent: null, at: { x: 500, y: 100 } })
  expect(page(store).items?.filter(i => !("x" in i))).toHaveLength(1)
})

test("付け替えで子の領域より左や上に来る形は、子の領域の左上へ寄せる", () => {
  const store = newStore()
  const b = place(store, { at: { x: 0, y: 0 }, w: 80, h: 40 })!
  const a = place(store, { at: { x: 200, y: 100 }, w: 300, h: 200 })!
  expect(run(store, "@matomezu/paper:item-reparent", { item: b, parent: a }).ok).toBe(true)
  expect(at(store, b)).toMatchObject({ parent: a, shape: { x: O.x, y: O.y } })
})

test("自分か自分の子孫の中へ・子を持てない形の中へ・今と同じ親へは付け替えない", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 } })!
  const b = place(store, { at: { x: 10, y: 10 }, parent: a, w: 80, h: 40 })!
  const list = run(store, "@matomezu/paper:item-place", { item: LIST, at: { x: 400, y: 0 } })
  const l = (list as { result: { item: string } }).result.item
  const reparent = (item: string, parent: string | null) =>
    run(store, "@matomezu/paper:item-reparent", { item, parent }).ok
  expect(reparent(a, a)).toBe(false)
  expect(reparent(a, b)).toBe(false)
  expect(reparent(b, l)).toBe(false)
  expect(reparent(b, a)).toBe(false)
  expect(reparent(a, null)).toBe(false)
  expect(ids(store)).toEqual([
    [a, null],
    [b, a],
    [l, null],
  ])
})

test("付け替えの道具で落とす先は、点の下で一番内側の子を持てる形。動かす形とその子孫・子を持てない形は除き、無ければページ", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const b = place(store, { at: { x: 20, y: 60 }, parent: a, w: 200, h: 150 })!
  const list = run(store, "@matomezu/paper:item-place", { item: LIST, at: { x: 600, y: 0 } })
  const l = (list as { result: { item: string } }).result.item
  const p = page(store)
  const inB = { x: 30, y: 70 }
  expect(dropTarget(CORE_CATALOG, p, l, inB)).toBe(b)
  expect(dropTarget(CORE_CATALOG, p, l, { x: 300, y: 250 })).toBe(a)
  expect(dropTarget(CORE_CATALOG, p, b, inB)).toBe(a)
  expect(dropTarget(CORE_CATALOG, p, a, inB)).toBeNull()
  expect(dropTarget(CORE_CATALOG, p, b, { x: 610, y: 10 })).toBeNull()
})

test("付け替えのコマンドは、動いた所で別の親へ入れ、同じ親ならその中で動かすだけ", () => {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const b = place(store, { at: { x: 500, y: 100 }, w: 80, h: 40 })!
  const zoom = store.state.getState().workspace.stages[0]!.zoom
  const screen = (x: number, y: number) => ({ x: x * zoom, y: y * zoom })
  store.actions.command("s1", "@matomezu/paper:paper-reparent", { item: b, parent: a, by: screen(-400, 0) })
  expect(at(store, b)).toMatchObject({ parent: a, at: { x: 100, y: 100 } })
  store.actions.command("s1", "@matomezu/paper:paper-reparent", { item: b, parent: a, by: screen(50, 0) })
  expect(at(store, b)).toMatchObject({ parent: a, at: { x: 150, y: 100 } })
})

test("子に付いた線は、端の形の先祖を避けずに通り、別の箱の中の子は避ける。子の上でも線を引ける相手になる", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const c = place(store, { at: { x: 20, y: 60 }, parent: a, w: 80, h: 40 })!
  const b = place(store, { at: { x: 500, y: 0 }, w: 300, h: 300 })!
  const e = place(store, { at: { x: 20, y: 60 }, parent: b, w: 80, h: 40 })!
  const d = place(store, { at: { x: 900, y: 0 }, w: 80, h: 40 })!
  expect(targetsFrom(CORE_CATALOG, page(store), d).has(c)).toBe(true)
  expect(run(store, "@matomezu/line:line-connect", { from: d, to: c }).ok).toBe(true)
  const areas = portAreasOf(CORE_CATALOG, page(store))
  expect(areas.get(c)?.ancestors).toEqual([a])
  const line = page(store).items!.find(i => !("x" in i)) as never
  const input = routeInputOf(line, areas, true)!
  const area = (id: string) => areas.get(id)!
  expect(input.obstacles).not.toContainEqual(area(a))
  expect(input.obstacles).toContainEqual(area(e))
  expect(input.obstacles).toContainEqual(area(b))
})

test("縦の位置が下の内包ボックスは、子の領域が上から始まり、子の下にキャプションと本文の高さを空ける。上・下を替えると子は子の領域ごと動く", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 300, h: 100, props: { caption: "社内" } })!
  const b = place(store, { at: { x: 20, y: 40 }, parent: a, w: 64, h: 40 })!
  const top = at(store, b)!.shape.y
  expect(top).toBeGreaterThanOrEqual(O.y)
  expect(run(store, "@matomezu/paper:item-update", { item: a, props: { vAlign: "bottom" } }).ok).toBe(true)
  const parent = at(store, a)!.shape
  expect(childOrigin(CORE_CATALOG, parent as never).y).toBe(NEST_PADDING)
  // 子は子の領域が上がった分だけ上がる
  expect(at(store, b)!.shape.y).toBe(top - (O.y - NEST_PADDING))
  // 親の大きさは、子の下にキャプションの高さ（何も書いていない箱の子の領域の上と同じ）を空ける
  const child = at(store, b)!.shape
  expect(placedSize(CORE_CATALOG, at(store, a)!.shape as never)!.h).toBeGreaterThanOrEqual(child.y + 40 + O.y)
  expect(run(store, "@matomezu/paper:item-update", { item: a, props: { vAlign: null } }).ok).toBe(true)
  expect(at(store, b)!.shape.y).toBe(top)
})
