import { expect, test } from "bun:test"
import type { Point } from "../../web/src/core/geom"
import type { BookOf } from "../../web/src/core/schema/book"
import { placement } from "../../web/src/core/stage"
import { PLACE_OFFSET } from "../../web/src/plugins/books/drawing/items/items"
import { newStore } from "../support"

// 紙の上の点 at に箱の左上が来るポインタの位置（表示領域の左上から）
function pointerFor(store: ReturnType<typeof newStore>, at: Point): Point {
  const p = placement(store.state.getState().workspace.stages[0]!)!
  return { x: p.x + at.x * p.zoom + PLACE_OFFSET.x, y: p.y + at.y * p.zoom + PLACE_OFFSET.y }
}
const page = (store: ReturnType<typeof newStore>, book = "b1", i = 0) =>
  (store.state.getState().books[book] as BookOf<"drawing">).pages[i]!

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}

test("箱を置こうとして紙の上で押すと、置くのをやめ、押した所を渡して追加のダイアログを開く（まだ置かない）", () => {
  const store = ready()
  store.actions.togglePlacing("s1", "shape.box")
  expect(store.actions.command("s1", "drawing.place", pointerFor(store, { x: 100, y: 50 }))).toBe(true)
  expect(page(store).items).toBeUndefined()
  expect(store.state.getState().dialog).toMatchObject({
    id: "box.add",
    stage: "s1",
    args: { page: "p1", at: { x: 100, y: 50 } },
  })
  expect(store.state.getState().workspace.stages[0]).toMatchObject({ placing: null, tool: "select" })
})

test("置くときに渡した項目を箱に入れ、書かなかった項目は既定。形に合わない項目なら置かない", () => {
  const store = ready()
  const at = { x: 100, y: 50 }
  store.actions.perform(
    "item.place",
    { page: "p1", item: "shape.box", at, props: { caption: "見出し", body: "本文" } },
    { book: "b1" },
  )
  expect(page(store).items).toEqual([
    { id: "n1", item: "shape.box", x: 100, y: 50, props: { caption: "見出し", rule: true, body: "本文" } },
  ])
  const bad = store.actions.perform(
    "item.place",
    { page: "p1", item: "shape.box", at, props: { text: "x" } },
    { book: "b1" },
  )
  expect(bad).toEqual({ ok: false, reason: "refused" })
})

test("紙から少しでもはみ出す所では置かず、置こうとしたままにする", () => {
  const store = ready()
  store.actions.togglePlacing("s1", "shape.box")
  store.actions.command("s1", "drawing.place", pointerFor(store, { x: -1, y: 0 }))
  const w = store.state.getState().workspace.stages[0]!.opened!.paper
  const right = w?.status === "known" ? w.size.w - 160 + 1 : 0
  store.actions.command("s1", "drawing.place", pointerFor(store, { x: right, y: 0 }))
  expect(page(store).items).toBeUndefined()
  expect(store.state.getState().workspace.stages[0]!.placing).toBe("shape.box")
})

test("アイテムの id は振った値から作り、ブックのどのページのアイテムとも重なれば振り直す", () => {
  const ids = ["p2", "x", "x", "y"]
  const store = newStore({ newId: () => ids.shift()! })
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  store.actions.addPage("s1", { title: "ページ 2" })
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x: 0, y: 0 } }, { book: "b1" })
  const done = store.actions.perform(
    "item.place",
    { page: "p2", item: "shape.box", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  expect(done).toEqual({ ok: true, result: { item: "y" } })
})

test("ブックで使えないアイテムは置けない", () => {
  const store = ready()
  const done = store.actions.perform(
    "item.place",
    { page: "p1", item: "shape.nope", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  expect(done).toEqual({ ok: false, reason: "refused" })
})

test("動かすのは画面の上で動いた量を倍率で割った量。はみ出すなら動かさない", () => {
  const store = ready()
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x: 10, y: 10 } }, { book: "b1" })
  store.actions.command("s1", "drawing.move", { items: ["n1"], by: { x: 30, y: 20 } })
  expect(page(store).items![0]).toMatchObject({ x: 40, y: 30 })
  store.actions.command("s1", "drawing.move", { items: ["n1"], by: { x: -41, y: 0 } })
  expect(page(store).items![0]).toMatchObject({ x: 40, y: 30 })
})

test("道具は選択・付け替え・ハンドの順に回り、替えると置こうとしていたアイテムを取り消す", () => {
  const store = ready()
  store.actions.togglePlacing("s1", "shape.box")
  const tools = [1, 2, 3].map(() => {
    store.actions.command("s1", "tool.next")
    return store.state.getState().workspace.stages[0]!.tool
  })
  expect(tools).toEqual(["reparent", "hand", "select"])
  expect(store.state.getState().workspace.stages[0]!.placing).toBeNull()
})

test("ハンドの道具でアイテムを置こうとすると、選択の道具に替わる。同じアイテムをもう一度選ぶと取り消す", () => {
  const store = ready()
  store.actions.setTool("s1", "hand")
  store.actions.togglePlacing("s1", "shape.box")
  expect(store.state.getState().workspace.stages[0]).toMatchObject({ tool: "select", placing: "shape.box" })
  store.actions.togglePlacing("s1", "shape.box")
  expect(store.state.getState().workspace.stages[0]!.placing).toBeNull()
})

test("ページを替えると、選択と置こうとしていたアイテムを捨てる。紙の無いマスターでは道具の切り替えを出さない", () => {
  const store = ready()
  store.actions.addPage("s1", { title: "ページ 2" })
  store.actions.select("s1", ["b9"])
  store.actions.togglePlacing("s1", "shape.box")
  store.actions.openPage("s1", "p1")
  expect(store.state.getState().workspace.stages[0]).toMatchObject({ placing: null, selection: [] })
  store.actions.command("s1", "stage.home")
  expect(store.actions.command("s1", "tool.next")).toBe(false)
})

test("箱の編集は書いた項目だけを変え、位置と id はそのまま。形に合わない項目・無い箱なら変えない", () => {
  const store = ready()
  const at = { x: 10, y: 20 }
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at, props: { caption: "前" } }, { book: "b1" })
  const done = store.actions.perform(
    "item.update",
    { page: "p1", item: "n1", props: { caption: "後", body: "本文" } },
    { book: "b1" },
  )
  expect(done.ok).toBe(true)
  expect(page(store).items).toEqual([
    { id: "n1", item: "shape.box", x: 10, y: 20, props: { caption: "後", rule: true, body: "本文" } },
  ])
  const bad = store.actions.perform("item.update", { page: "p1", item: "n1", props: { text: "x" } }, { book: "b1" })
  const none = store.actions.perform("item.update", { page: "p1", item: "b9", props: {} }, { book: "b1" })
  expect([bad.ok, none.ok]).toEqual([false, false])
})

test("箱を編集するコマンドは、そのページの箱を渡して編集のダイアログを開く", () => {
  const store = ready()
  store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x: 0, y: 0 } }, { book: "b1" })
  store.actions.command("s1", "drawing.edit", { item: "b9" })
  expect(store.state.getState().dialog).toBeNull()
  store.actions.command("s1", "drawing.edit", { item: "n1" })
  expect(store.state.getState().dialog).toMatchObject({ id: "box.edit", stage: "s1", args: { page: "p1", item: "n1" } })
})

test("選んでいるアイテムを消すと選択も外れる。選んでいなければ消すコマンドは出ない。無いアイテムは消さない", () => {
  const store = ready()
  for (const x of [0, 200, 400])
    store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x, y: 0 } }, { book: "b1" })
  expect(store.actions.command("s1", "drawing.delete")).toBe(false)
  store.actions.select("s1", ["n1", "n3"])
  expect(store.actions.command("s1", "drawing.delete")).toBe(true)
  expect(page(store).items!.map(i => i.id)).toEqual(["n2"])
  expect(store.state.getState().workspace.stages[0]!.selection).toEqual([])
  const none = store.actions.perform("item.remove", { page: "p1", items: ["n2", "b9"] }, { book: "b1" })
  expect(none.ok).toBe(false)
  expect(page(store).items!.map(i => i.id)).toEqual(["n2"])
})
