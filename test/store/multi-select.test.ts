// 複数選択（D84）: Mod+クリックの選び方（placing/selection.ts）、ブックが変わったら無くなった物を選択から外す（core の followBook）、全部を選ぶ・まとめて消すコマンド、
// 複数を選んだ右クリックのメニュー、両端の形を一緒に動かした線の手直し（base の followConnectors）
import { expect, test } from "bun:test"
import { type ItemPage, shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { amongSelected, onlySelected, toggledSelection } from "../../web/src/plugins/base"
import { anchorsFor } from "../../web/src/plugins/base/context-menu/anchor-targets"
import { linesOf } from "../../web/src/plugins/items/line/placed"
import { movableTogether } from "../../web/src/plugins/paper/placing/items"
import { pressSelection, sameLevel, sweptItems, sweptSelection } from "../../web/src/plugins/paper/placing/selection"
import { isShown } from "../../web/src/store/commands"
import { CORE_CATALOG, newStore } from "../support"

// 形の無いページ（押した物がどれも形でないときの選び方を見る）
const EMPTY = { id: "p0", items: [] } as unknown as ItemPage

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
type Store = ReturnType<typeof ready>
const page = (store: Store) => (store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!
const selection = (store: Store) => store.state.getState().workspace.stages[0]!.selection
const place = (store: Store, x: number, y: number, parent?: string, size = { w: 100, h: 64 }) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x, y }, ...size, ...(parent ? { parent } : {}) },
    { book: "b1" },
  )
const connect = (store: Store, from: string, to: string, props: Record<string, unknown> = {}) =>
  store.actions.perform("@matomezu/line:line-connect", { page: "p1", from, to, props }, { book: "b1" })
const move = (store: Store, items: string[], by: { x: number; y: number }) =>
  store.actions.perform("@matomezu/paper:item-move", { page: "p1", items, by }, { book: "b1" })

test("押したときの選び方: Mod なら足す（選んでいる物は、動かさずに離したときに外す）。修飾なしで選んでいる物を押したら、離したときにその 1 つへ選び直す", () => {
  expect(pressSelection(EMPTY, [], "a", false)).toEqual({ now: ["a"], drag: ["a"], release: null })
  expect(pressSelection(EMPTY, ["a"], "b", true)).toEqual({ now: ["a", "b"], drag: ["a", "b"], release: null })
  expect(pressSelection(EMPTY, ["a", "b"], "a", true)).toEqual({ now: ["a", "b"], drag: ["a", "b"], release: ["b"] })
  expect(pressSelection(EMPTY, ["a", "b"], "b", false)).toEqual({ now: ["a", "b"], drag: ["a", "b"], release: ["b"] })
  expect(pressSelection(EMPTY, ["a"], "a", false).release).toBeNull()
  expect(pressSelection(EMPTY, ["a", "b"], "c", false)).toEqual({ now: ["c"], drag: ["c"], release: null })
  expect(toggledSelection(["a", "b"], "a")).toEqual(["b"])
  expect(toggledSelection(["a"], "b")).toEqual(["a", "b"])
  expect(onlySelected(["a"], "a")).toBe(true)
  expect(onlySelected(["a", "b"], "a")).toBe(false)
  expect(amongSelected(["a", "b"], "a")).toBe(true)
  expect(amongSelected(["a"], "a")).toBe(false)
  expect(amongSelected(["a", "b"], "c")).toBe(false)
})

test("コメント・マークの付ける先は選んでいる物全部で、押した物を最後にする（押した物のそばに出す）", () => {
  expect(anchorsFor("a", ["a", "b", "c"])).toEqual(["b", "c", "a"])
  expect(anchorsFor("x", ["a", "b"])).toEqual(["x"])
})

test("ブックが変わったら、選択から無くなった物を外す（AI などが消した物も）。まとめて消すのは残っている物", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  place(store, 700, 100)
  store.actions.select("s1", ["n1", "n2", "n3"])
  expect(store.actions.perform("@matomezu/paper:item-remove", { page: "p1", items: ["n2"] }, { book: "b1" }).ok).toBe(
    true,
  )
  expect(selection(store)).toEqual(["n1", "n3"])
  expect(store.actions.command("s1", "@matomezu/paper:paper-delete")).toBe(true)
  expect(shapesOf(page(store)).map(s => s.id)).toEqual([])
  expect(selection(store)).toEqual([])
})

test("全部を選ぶ: ページの形と、両端がどちらもページの形の線（子の形と、子につながる線は選ばない）", () => {
  const store = ready()
  place(store, 100, 100, undefined, { w: 200, h: 150 })
  place(store, 400, 100)
  place(store, 20, 60, "n1") // n3 は n1 の子
  connect(store, "n1", "n2")
  connect(store, "n3", "n2")
  expect(store.actions.command("s1", "@matomezu/paper:paper-select-all")).toBe(true)
  expect(selection(store)).toEqual(["n1", "n2", "n4"])
})

test("内包の階層の違う形を一緒に選ぶと、深い形の代わりに、同じ階層の祖先を選ぶ", () => {
  const store = ready()
  place(store, 100, 100, undefined, { w: 300, h: 200 }) // n1
  place(store, 600, 100, undefined, { w: 300, h: 200 }) // n2
  place(store, 20, 60, "n1") // n3 は n1 の子
  place(store, 20, 60, "n2") // n4 は n2 の子
  place(store, 160, 60, "n1") // n5 は n1 の子
  connect(store, "n1", "n2") // n6
  expect(sameLevel(page(store), ["n3", "n5"])).toEqual(["n3", "n5"])
  expect(sameLevel(page(store), ["n3", "n2"])).toEqual(["n1", "n2"])
  expect(sameLevel(page(store), ["n3", "n4"])).toEqual(["n1", "n2"])
  expect(sameLevel(page(store), ["n1", "n3"])).toEqual(["n1"])
  expect(sameLevel(page(store), ["n3", "n6"])).toEqual(["n3", "n6"])
  expect(pressSelection(page(store), ["n3"], "n2", true).now).toEqual(["n1", "n2"])
})

test("一緒に動かせるのは、ページの形どうしか、同じ親の子どうし", () => {
  const store = ready()
  place(store, 100, 100, undefined, { w: 300, h: 200 })
  place(store, 600, 100)
  place(store, 20, 60, "n1")
  place(store, 160, 60, "n1")
  const book = store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
  expect(movableTogether(CORE_CATALOG, book, page(store), ["n1", "n2"])).toBe(true)
  expect(movableTogether(CORE_CATALOG, book, page(store), ["n3", "n4"])).toBe(true)
  expect(movableTogether(CORE_CATALOG, book, page(store), ["n2", "n3"])).toBe(false)
  expect(movableTogether(CORE_CATALOG, book, page(store), [])).toBe(false)
})

test("いくつか選んで、その中の物を右クリックしたメニューには「設定」を出さない（1 つだけなら出す）", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  store.actions.select("s1", ["n1", "n2"])
  store.actions.openContextMenu("s1", "@matomezu/paper:item-context", { item: "n1" }, { x: 0, y: 0 })
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/paper:paper-edit")).toBe(false)
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/paper:paper-delete")).toBe(true)
  store.actions.select("s1", ["n1"])
  store.actions.openContextMenu("s1", "@matomezu/paper:item-context", { item: "n1" }, { x: 0, y: 0 })
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/paper:paper-edit")).toBe(true)
  // 線のメニューも同じ
  connect(store, "n1", "n2")
  store.actions.select("s1", ["n1", "n3"])
  store.actions.openContextMenu("s1", "@matomezu/line:line-context", { item: "n3" }, { x: 0, y: 0 })
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/line:line-edit")).toBe(false)
  store.actions.select("s1", ["n3"])
  store.actions.openContextMenu("s1", "@matomezu/line:line-context", { item: "n3" }, { x: 0, y: 0 })
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/line:line-edit")).toBe(true)
})

test("両端の形を一緒に動かすと、線の手直しした区間も同じだけずれる。片方だけ動かしたら、手直しはそのまま", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 300)
  // 両端を、n1 の右の辺の真ん中と n2 の左の辺の真ん中に固定（ふち一周 328 の上で 132 と 296）
  expect(connect(store, "n1", "n2", { exitAt: 132 / 328, enterAt: 296 / 328, via: [300] }).ok).toBe(true)
  expect(move(store, ["n1", "n2"], { x: 20, y: 10 }).ok).toBe(true)
  expect(linesOf(page(store))[0]!.props.via).toEqual([320])
  expect(move(store, ["n2"], { x: 0, y: 10 }).ok).toBe(true)
  expect(linesOf(page(store))[0]!.props.via).toEqual([320])
})

test("範囲のドラッグ: 少しでもかかったページの形と、両端がどちらもその形の線を選ぶ。Mod なら押す前の選択に足す", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  place(store, 700, 100)
  connect(store, "n1", "n2")
  connect(store, "n2", "n3")
  const catalog = CORE_CATALOG
  // n1 の右の端と n2 の左の端にかかる四角
  expect(sweptItems(catalog, page(store), { x: 190, y: 90, w: 220, h: 20 })).toEqual(["n1", "n2", "n4"])
  expect(sweptItems(catalog, page(store), { x: 0, y: 0, w: 50, h: 50 })).toEqual([])
  // 子の形は入れない
  place(store, 900, 100, undefined, { w: 200, h: 150 })
  place(store, 20, 60, "n6")
  expect(sweptItems(catalog, page(store), { x: 930, y: 170, w: 10, h: 10 })).toEqual(["n6"])
  expect(sweptSelection(["n3"], ["n1", "n3"], true)).toEqual(["n3", "n1"])
  expect(sweptSelection(["n3"], ["n1"], false)).toEqual(["n1"])
})
