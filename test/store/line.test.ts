// 線のアクション（line.connect・line.update）と、線と形の決まり（組ごとの間隔・消すと線も消える・引けなくなった区間・関係の検査）

import { expect, test } from "bun:test"
import { restoreBooks } from "../../web/src/core/book"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { perform } from "../../web/src/core/perform"
import { GAP } from "../../web/src/core/place/push"
import { rectsOf, shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { alignedEndsOf } from "../../web/src/plugins/items/line/drawn"
import { elbowAt, usesLines } from "../../web/src/plugins/items/line/line"
import { CAPTION_GAP, LINK_GAP, linesOf } from "../../web/src/plugins/items/line/placed"
import { BUILTIN_PARTS, CORE_CATALOG, newStore, sequence } from "../support"

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
type Store = ReturnType<typeof ready>
const book = (store: Store) => store.state.getState().books.b1 as BookOf<"drawing">
const page = (store: Store) => book(store).pages[0]!
const shape = (store: Store, id: string) => shapesOf(page(store)).find(i => i.id === id)!
const lines = (store: Store) => linesOf(page(store))
const place = (store: Store, x: number, y: number, item = "shape.box") =>
  store.actions.perform(
    "item.place",
    { page: "p1", item, at: { x, y }, ...(item === "shape.box" ? { w: 100, h: 64 } : {}) },
    { book: "b1" },
  )
const connect = (store: Store, from: string, to: string, props: Record<string, unknown> = {}) =>
  store.actions.perform("line.connect", { page: "p1", from, to, props }, { book: "b1" })
const update = (store: Store, line: string, props: Record<string, unknown>) =>
  store.actions.perform("line.update", { page: "p1", line, props }, { book: "b1" })

test("線を引くと、ページの items に id・item・from・to・props の並びで残り、線の id を返す", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  const done = connect(store, "n1", "n2", { endHead: "arrow" })
  expect(done).toMatchObject({ ok: true, result: { line: "n3" } })
  expect(lines(store)).toEqual([
    { id: "n3", item: "connector.line", from: "n1", to: "n2", props: { endHead: "arrow" } },
  ])
  expect(Object.keys(lines(store)[0]!)).toEqual(["id", "item", "from", "to", "props"])
})

test("引けない相手: 無い形・リストの行・同じ組の 2 本目（向きは問わない）。自分に戻る線は何本でも引ける", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  expect(place(store, 100, 300, "shape.list").ok).toBe(true)
  store.actions.perform("row.add", { page: "p1", list: "n3" }, { book: "b1" })
  expect(connect(store, "n1", "x").ok).toBe(false)
  expect(connect(store, "n1", "n4").ok).toBe(false) // n4 はリストの行
  expect(connect(store, "n1", "n3").ok).toBe(true) // リストの枠にはつながる
  expect(connect(store, "n1", "n2").ok).toBe(true)
  expect(connect(store, "n2", "n1").ok).toBe(false)
  expect(connect(store, "n1", "n1").ok).toBe(true)
  expect(connect(store, "n1", "n1").ok).toBe(true)
  expect(lines(store).map(l => [l.from, l.to])).toEqual([
    ["n1", "n3"],
    ["n1", "n2"],
    ["n1", "n1"],
    ["n1", "n1"],
  ])
})

test("線でつなぐと間隔の下限が 32 になり、近すぎれば始点はそのままで終点の側をどける。キャプションを付けると 40", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 200 + GAP, 100)
  expect(connect(store, "n1", "n2").ok).toBe(true)
  expect(shape(store, "n1").x).toBe(100)
  expect(shape(store, "n2").x).toBe(200 + LINK_GAP)
  expect(update(store, "n3", { caption: "申請" }).ok).toBe(true)
  expect(shape(store, "n2").x).toBe(200 + CAPTION_GAP)
  // キャプションを消しても、詰め直しはしない（間隔の下限が狭まるだけ）
  expect(update(store, "n3", { caption: null }).ok).toBe(true)
  expect(shape(store, "n2").x).toBe(200 + CAPTION_GAP)
})

test("線でつながった箱を押すときも、つながった組は 32 空ける。つながっていない組は 8 のまま", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 240, 100)
  place(store, 380, 100)
  connect(store, "n1", "n2")
  expect(store.actions.perform("item.resize", { page: "p1", item: "n1", w: 150 }, { book: "b1" }).ok).toBe(true)
  expect(shape(store, "n2").x).toBe(250 + LINK_GAP)
  expect(shape(store, "n3").x).toBe(250 + LINK_GAP + 100 + GAP)
})

test("形を消すと、つながる線も消える。線だけを消すこともできる", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  place(store, 100, 400)
  connect(store, "n1", "n2")
  connect(store, "n1", "n3")
  connect(store, "n2", "n2")
  expect(store.actions.perform("item.remove", { page: "p1", items: ["n2"] }, { book: "b1" }).ok).toBe(true)
  expect(lines(store).map(l => l.id)).toEqual(["n5"])
  expect(store.actions.perform("item.remove", { page: "p1", items: ["n5"] }, { book: "b1" }).ok).toBe(true)
  expect(lines(store)).toEqual([])
  expect(shapesOf(page(store)).map(s => s.id)).toEqual(["n1", "n3"])
})

test("線は動かせず、大きさも項目（item.update）も変えられない", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  connect(store, "n1", "n2")
  const p = { book: "b1" }
  expect(store.actions.perform("item.move", { page: "p1", items: ["n3"], by: { x: 10, y: 0 } }, p).ok).toBe(false)
  expect(store.actions.perform("item.resize", { page: "p1", item: "n3", w: 200 }, p).ok).toBe(false)
  expect(store.actions.perform("item.update", { page: "p1", item: "n3", props: { caption: "x" } }, p).ok).toBe(false)
  expect(store.actions.perform("item.place", { page: "p1", item: "connector.line", at: { x: 0, y: 0 } }, p).ok).toBe(
    false,
  )
})

test("line.update: 書いた項目だけを変え、null は消す。項目の形に合わなければ断る", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  connect(store, "n1", "n2", { endHead: "arrow", dash: "dashed" })
  expect(update(store, "n3", { dash: null, startHead: "diamond", route: "straight" }).ok).toBe(true)
  expect(lines(store)[0]!.props).toEqual({ endHead: "arrow", startHead: "diamond", route: "straight" })
  expect(update(store, "n3", { route: "curve" }).ok).toBe(false)
  expect(update(store, "n3", { exitAt: 1.5 }).ok).toBe(false)
  expect(update(store, "n1", { dash: "dashed" }).ok).toBe(false) // n1 は箱
})

test("手で直した区間（via）は、両端が固定で引けるときだけ書ける。形を動かして引けなくなると消える", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 300)
  // 両端を、n1 の右の辺の真ん中と n2 の左の辺の真ん中に固定（ふち一周 328 の上で 132 と 296）
  const ends = { exitAt: 132 / 328, enterAt: 296 / 328 }
  expect(connect(store, "n1", "n2", { via: [300] }).ok).toBe(false) // 端が自由
  expect(connect(store, "n1", "n2", { ...ends, via: [150] }).ok).toBe(false) // n1 の中を通る
  expect(connect(store, "n1", "n2", { ...ends, via: [300] }).ok).toBe(true)
  expect(lines(store)[0]!.props.via).toEqual([300])
  // n2 を n1 の左へ動かすと、右の辺から出て左の辺へ入る形は引けない
  expect(
    store.actions.perform("item.move", { page: "p1", items: ["n2"], by: { x: -380, y: 0 } }, { book: "b1" }).ok,
  ).toBe(true)
  expect(lines(store)[0]!.props.via).toBeUndefined()
  expect(lines(store)[0]!.props.exitAt).toBe(132 / 328)
})

test("関係の決まりを守らないブック（線の端が無い・行につながる・同じ組に 2 本）は、読み込むときに捨てる", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  connect(store, "n1", "n2")
  const good = book(store)
  const withLines = (items: unknown[]) => ({
    ...good,
    pages: [{ ...good.pages[0]!, items: [...shapesOf(good.pages[0]!), ...items] }],
  })
  const line = (id: string, from: string, to: string) => ({ id, item: "connector.line", from, to, props: {} })
  expect(restoreBooks(CORE_CATALOG, [good])).toHaveLength(1)
  expect(restoreBooks(CORE_CATALOG, [withLines([line("l1", "n1", "zz")])])).toHaveLength(0)
  expect(restoreBooks(CORE_CATALOG, [withLines([line("l1", "n1", "n2"), line("l2", "n2", "n1")])])).toHaveLength(0)
  expect(restoreBooks(CORE_CATALOG, [withLines([line("l1", "n1", "n1"), line("l2", "n1", "n1")])])).toHaveLength(1)
})

test("line.update: via を持つ線を直線にする・端を自由に戻すと、引けなくなった via を消す（断らない）。via を書いて引けなければ断る", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 300)
  const ends = { exitAt: 132 / 328, enterAt: 296 / 328 }
  connect(store, "n1", "n2", { ...ends, via: [300] })
  expect(update(store, "n3", { via: [150] }).ok).toBe(false)
  expect(lines(store)[0]!.props.via).toEqual([300])
  expect(update(store, "n3", { route: "straight" }).ok).toBe(true)
  expect(lines(store)[0]!.props).toEqual({ ...ends, route: "straight" })
  expect(update(store, "n3", { route: null, via: [300] }).ok).toBe(true)
  expect(update(store, "n3", { exitAt: null }).ok).toBe(true)
  expect(lines(store)[0]!.props).toEqual({ enterAt: ends.enterAt })
})

test("page.update（ページの設定の項目 lineRoute）: ページの線の既定の通り方を直線にすると、通り方を持たない線が直線になり、引けなくなった via を消す。null で既定（折れ線）に戻す", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 300)
  const ends = { exitAt: 132 / 328, enterAt: 296 / 328 }
  connect(store, "n1", "n2", { ...ends, via: [300] })
  const pageUpdate = (lineRoute: "elbow" | "straight" | null) =>
    store.actions.perform("page.update", { page: "p1", settings: { lineRoute } }, { book: "b1" })
  expect(pageUpdate("straight").ok).toBe(true)
  expect(page(store).lineRoute).toBe("straight")
  expect(lines(store)[0]!.props).toEqual(ends)
  expect(pageUpdate(null).ok).toBe(true)
  expect("lineRoute" in page(store)).toBe(false)
  expect(
    store.actions.perform("page.update", { page: "p1", settings: { lineRoute: "curve" } }, { book: "b1" }).ok,
  ).toBe(false)
})

test("整列の位置: 横に並ぶ箱どうしは、向き合う辺の重なる範囲の真ん中。整列済みなら null", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 120)
  connect(store, "n1", "n2", { exitAt: 104 / 328 }) // n1 の右の辺の上の端の近く（y = 104）
  const rects = rectsOf(CORE_CATALOG, page(store))
  const ends = alignedEndsOf(lines(store)[0]!, rects, true)!
  expect(ends).toBeDefined()
  expect(update(store, "n3", ends).ok).toBe(true)
  expect(alignedEndsOf(lines(store)[0]!, rectsOf(CORE_CATALOG, page(store)), true)).toBeNull()
})

test("線の既定の通り方は、ページ → ブック → 折れ線の順に決まる。ブックを直線にすると（book.update の設定の項目）、ページの既定の無いページの線が直線になり、引けなくなった via を消す", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 300)
  const ends = { exitAt: 132 / 328, enterAt: 296 / 328 }
  connect(store, "n1", "n2", { ...ends, via: [300] })
  const book = () => store.state.getState().books.b1 as BookOf<"drawing">
  const elbow = () => elbowAt(CORE_CATALOG, book(), page(store))
  expect(elbow()).toBe(true)
  expect(store.actions.perform("book.update", { settings: { lineRoute: "straight" } }, { book: "b1" }).ok).toBe(true)
  expect(book().lineRoute).toBe("straight")
  expect(elbow()).toBe(false)
  expect(lines(store)[0]!.props).toEqual(ends)
  // ページの既定はブックより先
  store.actions.perform("page.update", { page: "p1", settings: { lineRoute: "elbow" } }, { book: "b1" })
  expect(elbow()).toBe(true)
  store.actions.perform("page.update", { page: "p1", settings: { lineRoute: null } }, { book: "b1" })
  expect(elbow()).toBe(false)
  expect(store.actions.perform("book.update", { settings: { lineRoute: null } }, { book: "b1" }).ok).toBe(true)
  expect("lineRoute" in book()).toBe(false)
  expect(elbow()).toBe(true)
})

test("線と線の既定の通り方を選ばないタイプのブックでは、線を引けず、線の既定の通り方も変えられない", () => {
  const store = ready()
  place(store, 100, 100)
  place(store, 400, 100)
  const book = store.state.getState().books.b1 as BookOf<"drawing">
  // 図面のタイプから、線と線の既定の通り方を外した機能台帳
  const noLines = buildCoreCatalog({
    ...BUILTIN_PARTS,
    bookTypes: BUILTIN_PARTS.bookTypes.map(t =>
      t.id === "drawing"
        ? {
            ...t,
            items: { allowed: ["shape.box", "shape.list"], defaults: ["shape.box", "shape.list"] },
            settings: {},
          }
        : t,
    ),
  })
  const ctx = { catalog: noLines, home: null, lang: "ja", newId: sequence("x") }
  expect(usesLines(CORE_CATALOG, book)).toBe(true)
  expect(usesLines(noLines, book)).toBe(false)
  expect(perform(book, "line.connect", { page: "p1", from: "n1", to: "n2" }, ctx).ok).toBe(false)
  expect(perform(book, "book.update", { settings: { lineRoute: "straight" } }, ctx).ok).toBe(false)
  expect(perform(book, "page.update", { page: "p1", settings: { lineRoute: "straight" } }, ctx).ok).toBe(false)
  // 同じ操作は、線が使えるブックなら通る
  const ok = { ...ctx, catalog: CORE_CATALOG }
  expect(perform(book, "line.connect", { page: "p1", from: "n1", to: "n2" }, ok).ok).toBe(true)
  expect(perform(book, "book.update", { settings: { lineRoute: "straight" } }, ok).ok).toBe(true)
})
