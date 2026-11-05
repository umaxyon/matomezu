// 子の形のアクション: 親を渡して置く・子を動かす・変える・大きさを変える・子孫ごと消す・付け替え（紙のプラグインの item-*）
import { expect, test } from "bun:test"
import { findShape, type ItemPage, walkShapes } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { childOrigin, frameOf, freeSpotIn } from "../../web/src/plugins/base/place/frame"
import { floorsOf, resizedBy, roomOf } from "../../web/src/plugins/base/place/items"
import { allRectsOf, NEST_PADDING, placedSize, portAreasOf } from "../../web/src/plugins/base/place/placed"
import { targetsFrom } from "../../web/src/plugins/items/line/connect"
import { routeInputOf } from "../../web/src/plugins/items/line/drawn"
import { dropTarget, placeTarget } from "../../web/src/plugins/paper/placing/items"
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
  place(store, { at: { x: 30, y: 60 }, parent: a, w: 100, h: 60, crowd: "push" })
  expect(at(store, b)!.shape.x).toBeGreaterThanOrEqual(30 + 100 + 8)
  expect(at(store, b)!.shape).toMatchObject({ w: 100, h: 60 })
})

test("子が入るよう親が育ち、近づきすぎたページの形を押す", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 } })!
  const d = place(store, { at: { x: 220, y: 0 } })!
  place(store, { at: { x: 150, y: 60 }, parent: a, w: 120, h: 40, crowd: "push" })
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
  expect(run(store, "@matomezu/paper:item-move", { items: [b], by: { x: 60, y: 0 }, crowd: "push" }).ok).toBe(true)
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

test("内包ボックスの中のリストにも、行のアクションが効く（足す・変える・チェック・動かす・消す）", () => {
  const store = newStore()
  const a = place(store, { at: { x: 40, y: 40 }, w: 400, h: 300 })!
  const l = place(store, { item: LIST, at: { x: 0, y: 0 }, parent: a, w: 240, h: 120, props: { checklist: true } })!
  type Row = { id: string; props: { caption: string; checked?: boolean } }
  const rows = () => (at(store, l)!.shape as { children?: Row[] }).children ?? []
  const added = run(store, "@matomezu/list:row-add", { list: l, props: { caption: "牛乳" } })
  expect(added.ok).toBe(true)
  run(store, "@matomezu/list:row-add", { list: l, props: { caption: "卵" } })
  const [milk, egg] = rows().map(r => r.id)
  expect(run(store, "@matomezu/list:row-update", { list: l, row: egg, props: { caption: "卵 6 個" } }).ok).toBe(true)
  expect(run(store, "@matomezu/list:row-check", { list: l, row: milk, checked: true }).ok).toBe(true)
  expect(run(store, "@matomezu/list:row-move", { list: l, row: egg, before: milk }).ok).toBe(true)
  expect(rows().map(r => [r.props.caption, r.props.checked === true])).toEqual([
    ["卵 6 個", false],
    ["牛乳", true],
  ])
  expect(run(store, "@matomezu/list:row-remove", { list: l, rows: [milk] }).ok).toBe(true)
  expect(rows().map(r => r.props.caption)).toEqual(["卵 6 個"])
  expect(at(store, l)?.parent).toBe(a)
})

// 紙の右端の近くに、子が 2 つ入った内包ボックス big（子の高さ 600 で、下へは押せない。描く幅は子が入る 648）を左端 x に置いたストア。
// own は内包ボックス自分の幅（w）。paper は紙の大きさ
function besideEdge(x = 460, own = 200) {
  const store = newStore()
  const big = place(store, { at: { x, y: 40 }, w: own, h: 100 })!
  place(store, { at: { x: 20, y: 40 }, parent: big, w: 300, h: 600 })
  place(store, { at: { x: 340, y: 40 }, parent: big, w: 300, h: 600 })
  const book = store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
  const paper = roomOf(CORE_CATALOG, book, page(store))!
  return { store, big, paper }
}
// ページのどの形も（子の形も、描く大きさで）紙の中か
const allInPaper = (store: ReturnType<typeof newStore>, paper: { w: number; h: number }) =>
  [...allRectsOf(CORE_CATALOG, page(store)).values()].every(
    r => r.x >= 0 && r.y >= 0 && r.x + r.w <= paper.w && r.y + r.h <= paper.h,
  )
const width = (store: ReturnType<typeof newStore>, id: string) =>
  placedSize(CORE_CATALOG, at(store, id)!.shape as never)!.w

test("押した列を縮めて収めるとき、内包ボックスは子が入る大きさより小さくしない。入らなければ断り、紙の外へ押し出さない", () => {
  // 置いて押す（右へも下へも押せず、縮めても子が入らない）
  const { store, big, paper } = besideEdge()
  const was = JSON.stringify(page(store))
  expect(place(store, { at: { x: 380, y: 60 }, crowd: "push" })).toBeNull()
  expect(JSON.stringify(page(store))).toBe(was)
  // 大きさを変えて押す
  const small = place(store, { at: { x: 40, y: 40 }, w: 64, h: 64 })!
  expect(run(store, "@matomezu/paper:item-resize", { item: small, w: 440 }).ok).toBe(false)
  // 線でつないで、組の間隔まで離す（今は 8 空き、線でつなぐと 32 要る）
  const near = place(store, { at: { x: 460 - 8 - 72, y: 40 }, w: 72, h: 64 })!
  expect(run(store, "@matomezu/line:line-connect", { from: near, to: big }).ok).toBe(false)
  expect(at(store, big)!.at.x).toBe(460)
  expect(allInPaper(store, paper)).toBe(true)
})

test("内包ボックスは、子が入る大きさまでは縮めて押せる（描く大きさも紙の中）", () => {
  // 自分の幅が 748（子が入る幅 648 より 100 広い）。右端は 1108 で、下へは押せず、右へ押すと 33 はみ出す分を縮めて収める
  const { store, big, paper } = besideEdge(360, 748)
  expect(place(store, { at: { x: 300, y: 60 }, w: 100, h: 100, crowd: "push" })).not.toBeNull()
  expect(at(store, big)!.at.x).toBe(408)
  expect(width(store, big)).toBeGreaterThanOrEqual(648)
  expect(allInPaper(store, paper)).toBe(true)
})

test("縮めてよい下限は、子を持つ形では子が入る大きさ（キャプションの幅より広くても）", () => {
  const { store, big } = besideEdge(360, 748)
  expect(floorsOf(CORE_CATALOG, page(store)).get(big)).toMatchObject({ w: 648 })
})

test("内包ボックスの辺をつまんで縮めると、子がみな入る大きさで止まる（左の辺も。描く大きさとつまんだ大きさがそろう）", () => {
  const { store, big, paper } = besideEdge(360, 748)
  const shape = at(store, big)!.shape
  expect(resizedBy(CORE_CATALOG, shape, { x: "right" }, { x: -400, y: 0 }, paper)).toMatchObject({ x: 360, w: 648 })
  expect(resizedBy(CORE_CATALOG, shape, { x: "left" }, { x: 400, y: 0 }, paper)).toMatchObject({ x: 460, w: 648 })
  const tall = resizedBy(CORE_CATALOG, shape, { y: "bottom" }, { x: 0, y: -400 }, paper)!
  expect(tall.h).toBe(placedSize(CORE_CATALOG, shape as never)!.h)
})

const drawing = (store: ReturnType<typeof newStore>) =>
  store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">

test("置く先: 点の下に形が無ければページのその所、子を持てる形の上ならその中（親の左上から）、子を持てない形の上ならその親の中の空き", () => {
  const store = newStore()
  const a = place(store, { at: { x: 100, y: 100 }, w: 400, h: 300 })!
  const l = place(store, { item: LIST, at: { x: 0, y: 0 }, parent: a, w: 160, h: 100 })!
  const top = place(store, { item: LIST, at: { x: 700, y: 100 }, w: 160, h: 100 })!
  const size = { w: 120, h: 60 }
  const target = (pointer: { x: number; y: number }) =>
    placeTarget(CORE_CATALOG, drawing(store), page(store), pointer, { x: pointer.x - 16, y: pointer.y - 12 }, size)
  expect(target({ x: 40, y: 40 })).toEqual({ parent: null, at: { x: 24, y: 28 } })
  expect(target({ x: 400, y: 300 })).toEqual({ parent: a, at: { x: 284, y: 188 } })
  // 内包ボックスの中のリスト（子の領域の左上）の上: 子の領域の格子で、リストの右の目（目の幅はリストの幅 160 と間隔）
  const inList = at(store, l)!.at
  expect(target({ x: inList.x + 10, y: inList.y + 10 })).toEqual({ parent: a, at: { x: O.x + 160 + 8, y: O.y } })
  // ページのリストの上: ページの左上から格子で、内包ボックスとリストに近づかない目
  const spot = target({ x: 710, y: 110 })!
  expect(spot.parent).toBeNull()
  const placed = place(store, { at: spot.at, w: size.w, h: size.h })!
  expect(at(store, placed)!.at).toEqual(spot.at)
  expect(at(store, a)!.at).toEqual({ x: 100, y: 100 })
  expect(at(store, top)!.at).toEqual({ x: 700, y: 100 })
})

test("空きの格子: 子の領域では必ず見つかり（行が下へ増える）、紙で入る目が無ければ null", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  for (const x of [0, 108]) place(store, { at: { x: O.x + x, y: O.y }, parent: a, w: 100, h: 60 })
  const frame = frameOf(CORE_CATALOG, drawing(store), page(store), a)!
  // 兄弟 2 つと置く形で 3 つ: 列は 2、空いた目は 2 行目の左
  expect(freeSpotIn(frame, { w: 100, h: 60 })).toEqual({ x: 0, y: 68 })
  const paper = frameOf(CORE_CATALOG, drawing(store), page(store), null)!
  expect(freeSpotIn(paper, { w: paper.paper.w, h: paper.paper.h })).toBeNull()
})

test("座標を渡さずに置くと、親（無ければページ）の中の空きに置き、置いた所を返す", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const first = run(store, "@matomezu/paper:item-place", { item: NEST, w: 100, h: 60 })
  expect(first).toMatchObject({ ok: true, result: { at: { x: 400 + 8, y: 0 } } })
  const child = run(store, "@matomezu/paper:item-place", { item: NEST, parent: a, w: 100, h: 60 })
  expect(child).toMatchObject({ ok: true, result: { at: O } })
  expect(at(store, (child as { result: { item: string } }).result.item)?.parent).toBe(a)
})

test("押し方を渡さずに、ほかの形を動かす所へ置く・動かす・付け替えると断り、動かす形と空きを添える。何も変えない。push なら今どおり", () => {
  const store = newStore()
  const a = place(store, { at: { x: 0, y: 0 }, w: 400, h: 300 })!
  const b = place(store, { at: { x: 500, y: 0 }, w: 100, h: 60 })!
  const d = place(store, { at: { x: 0, y: 0 }, parent: a, w: 80, h: 40 })!
  const was = JSON.stringify(page(store))
  const detail = (done: object) => (done as { detail?: string }).detail ?? ""
  // 置く: 内包ボックス a にかかる。a は子を持てるので、中へ入れる parent を添える
  const placed = run(store, "@matomezu/paper:item-place", { item: NEST, at: { x: 380, y: 0 }, w: 100, h: 60 })
  expect(placed).toMatchObject({ ok: false, reason: "refused" })
  expect(detail(placed)).toStartWith(`it would move ${a}`)
  expect(detail(placed)).toContain(`pass parent "${a}" to put it inside`)
  expect(detail(placed)).toContain("a free spot there: at")
  // 動かす: b を a の手前まで動かすと、言われた所に着かない（ドラッグなら手前で止まる）
  const moved = run(store, "@matomezu/paper:item-move", { items: [b], by: { x: -150, y: 0 } })
  expect(detail(moved)).toContain(`${b} would stop short of where asked`)
  // 付け替え: a の子 d を、ページの b の所へ出すと b を押す
  const out = run(store, "@matomezu/paper:item-reparent", { item: d, parent: null, at: { x: 500, y: 0 } })
  expect(detail(out)).toStartWith(`it would move ${b}`)
  expect(JSON.stringify(page(store))).toBe(was)
  expect(run(store, "@matomezu/paper:item-move", { items: [b], by: { x: -150, y: 0 }, crowd: "push" }).ok).toBe(true)
  const pushed = run(store, "@matomezu/paper:item-reparent", {
    item: d,
    parent: null,
    at: { x: 600, y: 200 },
    crowd: "push",
  })
  expect(pushed.ok).toBe(true)
})
