import { expect, test } from "bun:test"
import type { Point } from "../../web/src/core/geom"
import type { BookOf } from "../../web/src/core/schema/book"
import { placement } from "../../web/src/core/stage"
import { toolOf } from "../../web/src/core/workspace"
import { BUILTIN } from "../../web/src/plugins"
import { addPageIn } from "../../web/src/plugins/base"
import { NEST_BOX } from "../../web/src/plugins/items/box/box"
import { PLACE_OFFSET } from "../../web/src/plugins/paper/placing/items"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { isShown } from "../../web/src/store/commands"
import type { Plugin } from "../../web/src/store/plugin"
import { createMatomezuInstance } from "../../web/src/store/store"
import { newStore, sequence } from "../support"

// 紙の上の点 at に箱の左上が来るポインタの位置（表示領域の左上から）
function pointerFor(store: ReturnType<typeof newStore>, at: Point): Point {
  const p = placement(store.state.getState().workspace.stages[0]!)!
  return { x: p.x + at.x * p.zoom + PLACE_OFFSET.x, y: p.y + at.y * p.zoom + PLACE_OFFSET.y }
}
const page = (store: ReturnType<typeof newStore>, book = "b1", i = 0) =>
  (store.state.getState().books[book] as BookOf<"@matomezu/drawing:drawing">).pages[i]!

// そのステージの今の道具
const toolAt = (store: ReturnType<typeof newStore>, stage = "s1") =>
  toolOf(store.catalog.core, store.state.getState().workspace, stage)

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}

test("箱を置こうとして紙の上で押すと、置くのをやめ、押した所を渡して追加のダイアログを開く（まだ置かない）", () => {
  const store = ready()
  store.actions.togglePlacing("s1", "@matomezu/box:shape-nest-box")
  expect(store.actions.command("s1", "@matomezu/paper:paper-place", pointerFor(store, { x: 100, y: 50 }))).toBe(true)
  expect(page(store).items).toBeUndefined()
  expect(store.state.getState().dialog).toMatchObject({
    id: "@matomezu/box:nest-box-add",
    stage: "s1",
    args: { page: "p1", at: { x: 100, y: 50 } },
  })
  expect(store.state.getState().workspace.stages[0]).toMatchObject({ placing: null })
  expect(toolAt(store)).toBe("@matomezu/base:select")
})

test("置くときに渡した項目を箱に入れ、書かなかった項目は既定。形に合わない項目なら置かない", () => {
  const store = ready()
  const at = { x: 100, y: 50 }
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at, props: { caption: "見出し", body: "本文" } },
    { book: "b1" },
  )
  expect(page(store).items).toEqual([
    {
      id: "n1",
      item: "@matomezu/box:shape-nest-box",
      x: 100,
      y: 50,
      w: 64,
      h: 64,
      props: { caption: "見出し", rule: true, body: "本文", captionAlign: "center", bodyAlign: "left" },
    },
  ])
  const bad = store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at, props: { text: "x" } },
    { book: "b1" },
  )
  expect(bad).toEqual({ ok: false, reason: "refused" })
})

test("紙から少しでもはみ出す所では置かず、置こうとしたままにする", () => {
  const store = ready()
  store.actions.togglePlacing("s1", "@matomezu/box:shape-nest-box")
  store.actions.command("s1", "@matomezu/paper:paper-place", pointerFor(store, { x: -1, y: 0 }))
  const w = store.state.getState().workspace.stages[0]!.opened!.paper
  const right = w?.status === "known" ? w.size.w - 64 + 1 : 0
  store.actions.command("s1", "@matomezu/paper:paper-place", pointerFor(store, { x: right, y: 0 }))
  expect(page(store).items).toBeUndefined()
  expect(store.state.getState().workspace.stages[0]!.placing).toBe("@matomezu/box:shape-nest-box")
})

test("アイテムの id は振った値から作り、ブックのどのページのアイテムとも重なれば振り直す", () => {
  const ids = ["p2", "x", "x", "y"]
  const store = newStore({ newId: () => ids.shift()! })
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  addPageIn(store, "s1", { title: "ページ 2" })
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  const done = store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p2", item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  expect(done).toEqual({ ok: true, result: { item: "y" } })
})

test("ブックで使えないアイテムは置けない", () => {
  const store = ready()
  const done = store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "shape.nope", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  expect(done).toEqual({ ok: false, reason: "refused" })
})

test("動かすのは画面の上で動いた量を倍率で割った量。はみ出すなら動かさない", () => {
  const store = ready()
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 10, y: 10 } },
    { book: "b1" },
  )
  store.actions.command("s1", "@matomezu/paper:paper-move", { items: ["n1"], by: { x: 30, y: 20 } })
  expect(page(store).items![0]).toMatchObject({ x: 40, y: 30 })
  store.actions.command("s1", "@matomezu/paper:paper-move", { items: ["n1"], by: { x: -41, y: 0 } })
  expect(page(store).items![0]).toMatchObject({ x: 40, y: 30 })
})

test("道具は選択・付け替え・ハンドの順に回り、替えると置こうとしていたアイテムを取り消す", () => {
  const store = ready()
  store.actions.togglePlacing("s1", "@matomezu/box:shape-nest-box")
  const tools = [1, 2, 3].map(() => {
    store.actions.command("s1", "@matomezu/base:tool-next")
    return toolAt(store)
  })
  expect(tools).toEqual(["@matomezu/paper:reparent", "@matomezu/base:hand", "@matomezu/base:select"])
  expect(store.state.getState().workspace.stages[0]!.placing).toBeNull()
})

test("ハンドの道具でアイテムを置こうとすると、選択の道具に替わる。同じアイテムをもう一度選ぶと取り消す", () => {
  const store = ready()
  store.actions.setTool("s1", "@matomezu/base:hand")
  store.actions.togglePlacing("s1", "@matomezu/box:shape-nest-box")
  expect(store.state.getState().workspace.stages[0]).toMatchObject({ placing: "@matomezu/box:shape-nest-box" })
  expect(toolAt(store)).toBe("@matomezu/base:select")
  store.actions.togglePlacing("s1", "@matomezu/box:shape-nest-box")
  expect(store.state.getState().workspace.stages[0]!.placing).toBeNull()
})

test("ページを替えると、選択と置こうとしていたアイテムを捨てる。紙の無いマスターでは道具の切り替えを出さない", () => {
  const store = ready()
  addPageIn(store, "s1", { title: "ページ 2" })
  store.actions.select("s1", ["b9"])
  store.actions.togglePlacing("s1", "@matomezu/box:shape-nest-box")
  store.actions.openPage("s1", "p1")
  expect(store.state.getState().workspace.stages[0]).toMatchObject({ placing: null, selection: [] })
  store.actions.command("s1", "@matomezu/base:stage-home")
  expect(store.actions.command("s1", "@matomezu/base:tool-next")).toBe(false)
})

test("箱の編集は書いた項目だけを変え、位置・大きさと id はそのまま。形に合わない項目・無い箱なら変えない", () => {
  const store = ready()
  const at = { x: 10, y: 20 }
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at, props: { caption: "前" } },
    { book: "b1" },
  )
  const done = store.actions.perform(
    "@matomezu/paper:item-update",
    { page: "p1", item: "n1", props: { caption: "後", body: "本文" } },
    { book: "b1" },
  )
  expect(done.ok).toBe(true)
  expect(page(store).items).toEqual([
    {
      id: "n1",
      item: "@matomezu/box:shape-nest-box",
      x: 10,
      y: 20,
      w: 64,
      h: 64,
      props: { caption: "後", rule: true, body: "本文", captionAlign: "center", bodyAlign: "left" },
    },
  ])
  const bad = store.actions.perform(
    "@matomezu/paper:item-update",
    { page: "p1", item: "n1", props: { text: "x" } },
    { book: "b1" },
  )
  const none = store.actions.perform(
    "@matomezu/paper:item-update",
    { page: "p1", item: "b9", props: {} },
    { book: "b1" },
  )
  expect([bad.ok, none.ok]).toEqual([false, false])
})

test("箱を編集するコマンドは、そのページの箱を渡して編集のダイアログを開く", () => {
  const store = ready()
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 0, y: 0 } },
    { book: "b1" },
  )
  store.actions.command("s1", "@matomezu/paper:paper-edit", { item: "b9" })
  expect(store.state.getState().dialog).toBeNull()
  store.actions.command("s1", "@matomezu/paper:paper-edit", { item: "n1" })
  expect(store.state.getState().dialog).toMatchObject({
    id: "@matomezu/box:box-edit",
    stage: "s1",
    args: { page: "p1", item: "n1" },
  })
})

test("追加と編集のダイアログを持たない形は、押した所にそのまま置き、右クリックのメニューに「設定」を出さない", () => {
  const plain = { ...NEST_BOX, dialogs: undefined }
  const plugins = BUILTIN.map(p =>
    (p as Plugin).items?.includes(NEST_BOX)
      ? { ...p, items: (p as Plugin).items!.map(i => (i === NEST_BOX ? plain : i)) }
      : p,
  )
  const store = createMatomezuInstance({
    plugins,
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
  })
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  store.actions.togglePlacing("s1", "@matomezu/box:shape-nest-box")
  store.actions.command("s1", "@matomezu/paper:paper-place", pointerFor(store as never, { x: 100, y: 50 }))
  expect(store.state.getState().dialog).toBeNull()
  expect(page(store as never).items).toMatchObject([{ id: "n1", item: "@matomezu/box:shape-nest-box", x: 100, y: 50 }])
  store.actions.openContextMenu("s1", "@matomezu/paper:item-context", { item: "n1" }, { x: 0, y: 0 })
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/paper:paper-edit")).toBe(false)
  expect(isShown(store, store.state.getState(), "s1", "@matomezu/paper:paper-delete")).toBe(true)
})

test("選んでいるアイテムを消すと選択も外れる。選んでいなければ消すコマンドは出ない。無いアイテムは消さない", () => {
  const store = ready()
  for (const x of [0, 200, 400])
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x, y: 0 } },
      { book: "b1" },
    )
  expect(store.actions.command("s1", "@matomezu/paper:paper-delete")).toBe(false)
  store.actions.select("s1", ["n1", "n3"])
  expect(store.actions.command("s1", "@matomezu/paper:paper-delete")).toBe(true)
  expect(page(store).items!.map(i => i.id)).toEqual(["n2"])
  expect(store.state.getState().workspace.stages[0]!.selection).toEqual([])
  const none = store.actions.perform("@matomezu/paper:item-remove", { page: "p1", items: ["n2", "b9"] }, { book: "b1" })
  expect(none.ok).toBe(false)
  expect(page(store).items!.map(i => i.id)).toEqual(["n2"])
})

test("道具は道具の組ごとに 1 つ。同じ組を使うステージは、開いているブックが違っても同じ道具になる。紙の無いマスターは道具を持たない", () => {
  const store = ready()
  store.actions.split("s1")
  store.actions.openBook("s2", "b2")
  store.actions.setTool("s1", "@matomezu/base:hand")
  expect([toolAt(store, "s1"), toolAt(store, "s2")]).toEqual(["@matomezu/base:hand", "@matomezu/base:hand"])
  store.actions.command("s2", "@matomezu/base:tool-next")
  expect([toolAt(store, "s1"), toolAt(store, "s2")]).toEqual(["@matomezu/base:select", "@matomezu/base:select"])
  store.actions.openBook("s2", "@matomezu/master:master")
  expect(toolAt(store, "s2")).toBeNull()
  expect(store.actions.command("s2", "@matomezu/base:tool-next")).toBe(false)
})

test("置こうとしているアイテムはステージごと。道具を替えると、同じ組を使うステージの全部で取り消す", () => {
  const store = ready()
  store.actions.split("s1")
  store.actions.openBook("s2", "b2")
  store.actions.setTool("s1", "@matomezu/base:hand")
  store.actions.togglePlacing("s2", "@matomezu/box:shape-nest-box")
  const placing = () => store.state.getState().workspace.stages.map(s => s.placing)
  expect(placing()).toEqual([null, "@matomezu/box:shape-nest-box"])
  expect(toolAt(store, "s1")).toBe("@matomezu/base:select")
  store.actions.setTool("s1", "@matomezu/base:hand")
  expect(placing()).toEqual([null, null])
})
