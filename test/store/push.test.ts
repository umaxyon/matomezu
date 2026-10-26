import { expect, test } from "bun:test"
import { GAP, planPlace, pushFrom, pushShrinking, type Rect } from "../../web/src/core/place/push"
import { shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { placedWidth } from "../../web/src/plugins/items/box/size"
import { newStore } from "../support"

const PAPER = { w: 1123, h: 794 } // A4 横
const rects = (o: Record<string, Rect>) => new Map(Object.entries(o))
const r = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h })

test("横に育つと、右に並んだ箱を同じ向きに押し、押された箱がまた右の箱を押す。左の箱と、離れた箱は動かない", () => {
  const before = rects({ a: r(100, 100), b: r(220, 100), c: r(340, 100), left: r(0, 100, 90), far: r(800, 100) })
  const after = pushFrom(before, "a", r(100, 100, 200), PAPER)!
  expect(after.get("b")).toEqual(r(300 + GAP, 100))
  expect(after.get("c")).toEqual(r(300 + GAP + 100 + GAP, 100))
  expect(after.get("left")).toEqual(r(0, 100, 90))
  expect(after.get("far")).toEqual(r(800, 100))
})

test("縦に育つと、下の箱を下へ押す。横には動かさない", () => {
  const after = pushFrom(rects({ a: r(100, 100), b: r(130, 180) }), "a", r(100, 100, 100, 150), PAPER)!
  expect(after.get("b")).toEqual(r(130, 250 + GAP))
})

test("左の辺をつかんで左へ広げると、左の箱を左へ押す", () => {
  const after = pushFrom(rects({ a: r(300, 100), b: r(150, 100) }), "a", r(200, 100, 200), PAPER)!
  expect(after.get("b")).toEqual(r(200 - GAP - 100, 100))
})

test("斜めに離れた箱は、横と縦の両方で近づきすぎたときだけ、離れていた方の向きに押す", () => {
  const before = rects({ a: r(100, 100), b: r(260, 200) })
  expect(pushFrom(before, "a", r(100, 100, 150), PAPER)!.get("b")).toEqual(r(260, 200))
  expect(pushFrom(before, "a", r(100, 100, 200, 140), PAPER)!.get("b")).toEqual(r(300 + GAP, 200))
})

test("押した先が紙からはみ出すなら収まらない。前から近づきすぎていた組は押さない", () => {
  expect(pushFrom(rects({ a: r(800, 100), b: r(1000, 100) }), "a", r(800, 100, 250), PAPER)).toBeNull()
  const after = pushFrom(rects({ a: r(100, 100), b: r(150, 120) }), "a", r(100, 100, 120), PAPER)!
  expect(after.get("b")).toEqual(r(150, 120))
})

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
const items = (store: ReturnType<typeof newStore>) =>
  shapesOf((store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!)
const at = (store: ReturnType<typeof newStore>, id: string) => items(store).find(i => i.id === id)!
const place = (store: ReturnType<typeof newStore>, x: number, y: number, w: number, caption = "") =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-box", at: { x, y }, w, h: 64, props: { caption } },
    { book: "b1" },
  )

test("@matomezu/paper:item-resize で広げると隣の箱を押し、紙の端で詰まれば押した箱を縮めて収める。縮めても収まらなければ断って何も変えない", () => {
  const store = ready()
  place(store, 100, 100, 100)
  place(store, 220, 100, 100)
  const resize = (w: number) =>
    store.actions.perform("@matomezu/paper:item-resize", { page: "p1", item: "n1", w }, { book: "b1" })
  expect(resize(200).ok).toBe(true)
  expect(at(store, "n2")).toMatchObject({ x: 300 + GAP, y: 100 })
  expect(resize(940).ok).toBe(true)
  expect(at(store, "n2")).toMatchObject({ x: 1040 + GAP, w: PAPER.w - 1040 - GAP })
  expect(resize(1000).ok).toBe(false)
  expect(at(store, "n1").w).toBe(940)
})

test("キャプションで広がるときも隣を押す。押した箱が収まらなければ、広げずにキャプションだけ変える", () => {
  const store = ready()
  place(store, 100, 100, 64)
  place(store, 180, 100, 100)
  const update = (caption: string) =>
    store.actions.perform("@matomezu/paper:item-update", { page: "p1", item: "n1", props: { caption } }, { book: "b1" })
  const twenty = "あ".repeat(20)
  expect(update(twenty).ok).toBe(true)
  const w = placedWidth({ caption: twenty, rule: true, body: "", captionAlign: "center", bodyAlign: "left" })
  expect(at(store, "n1").w).toBe(w)
  expect(at(store, "n2").x).toBe(100 + w + GAP)
  place(store, 1023 - 100, 300, 100)
  place(store, 100, 300, 64)
  store.actions.perform("@matomezu/paper:item-resize", { page: "p1", item: "n3", x: 1023 }, { book: "b1" })
  store.actions.perform(
    "@matomezu/paper:item-resize",
    { page: "p1", item: "n4", x: 1023 - 100 - GAP - 64 },
    { book: "b1" },
  )
  expect(
    store.actions.perform(
      "@matomezu/paper:item-update",
      { page: "p1", item: "n4", props: { caption: twenty } },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  expect(at(store, "n4")).toMatchObject({ w: 64, props: { caption: twenty } })
})

test("置いた所に箱があれば、相手を右へ押し、駄目なら下へ押す。どちらも駄目なら置けない", () => {
  const after = planPlace(rects({ b: r(150, 100) }), "n", r(100, 100), PAPER)!
  expect(after.get("b")).toEqual(r(200 + GAP, 100))
  const right = rects({ b: r(1000, 100) })
  expect(planPlace(right, "n", r(960, 100), PAPER)!.get("b")).toEqual(r(1000, 160 + GAP))
  const corner = rects({ b: r(1000, 700) })
  expect(planPlace(corner, "n", r(960, 680), PAPER)).toBeNull()
})

const floor = (o: Record<string, { w: number; h: number }>) => new Map(Object.entries(o))

test("押した列が紙の端で詰まれば、押された箱だけを余裕（今の大きさ − 下限）に比例して縮める。押した箱は縮めない", () => {
  // a を 500 幅にすると、b・c を押して 400 はみ出す… の手前。b の余裕 200、c の余裕 100 で 60 足りない → b が 40、c が 20 縮む
  const before = rects({ a: r(0, 100), b: r(108, 100, 300), c: r(416, 100, 200) })
  const wide = r(0, 100, 433 + 200 - 300 + 400 - 8)
  const floors = floor({ a: { w: 100, h: 28 }, b: { w: 100, h: 28 }, c: { w: 100, h: 28 } })
  const paper = { w: 1040, h: 794 }
  const after = pushShrinking(before, new Map([["a", wide]]), paper, floors)!
  const b = after.get("b")!
  const c = after.get("c")!
  expect(after.get("a")).toEqual(wide)
  expect(c.x + c.w).toBeLessThanOrEqual(paper.w)
  expect(b.x).toBe(wide.w + GAP)
  expect(300 - b.w).toBeGreaterThan(200 - c.w) // 余裕の大きい b が多く縮む
  expect(b.w).toBeGreaterThanOrEqual(100)
  expect(c.w).toBeGreaterThanOrEqual(100)
})

test("列に入らない箱は縮めない。余裕が足りなければ収まらない", () => {
  const before = rects({ a: r(0, 100), b: r(108, 100, 300), d: r(500, 400, 300) })
  const floors = floor({ b: { w: 100, h: 28 }, d: { w: 100, h: 28 } })
  const after = pushShrinking(before, new Map([["a", r(0, 100, 900)]]), PAPER, floors)!
  expect(after.get("d")).toEqual(r(500, 400, 300))
  expect(after.get("b")!.w).toBe(PAPER.w - 900 - GAP)
  expect(pushShrinking(before, new Map([["a", r(0, 100, 1050)]]), PAPER, floors)).toBeNull()
})

test("縦も同じ: 下へ押した列が詰まれば高さを縮める（本文が切れる）", () => {
  const before = rects({ a: r(100, 100), b: r(100, 200, 100, 200) })
  const floors = floor({ b: { w: 100, h: 28 } })
  const after = pushShrinking(before, new Map([["a", r(100, 100, 100, 600)]]), PAPER, floors)!
  expect(after.get("b")).toEqual(r(100, 700 + GAP, 100, PAPER.h - 700 - GAP))
})

test("置いたときは、縮めずに右・下を試してから、縮めて右、縮めて下", () => {
  const before = rects({ b: r(1000, 100, 120), c: r(960, 700, 120, 80) })
  const floors = floor({ b: { w: 64, h: 28 }, c: { w: 64, h: 28 } })
  const after = planPlace(before, "n", r(960, 100), PAPER, floors)!
  expect(after.get("b")).toEqual(r(1000, 160 + GAP, 120))
  // 右へも下へも押せない: 右へ縮めて入るなら右（b の幅 55 は下限 40 以上）
  const full = rects({ b: r(1000, 100, 120), c: r(1000, 168, 120, 600) })
  const right = planPlace(full, "n", r(960, 100), PAPER, floor({ b: { w: 40, h: 28 }, c: { w: 40, h: 28 } }))!
  expect(right.get("b")).toEqual(r(1060 + GAP, 100, PAPER.w - 1060 - GAP))
  // 右へ縮めても入らなければ（下限 64）、縮めて下へ: b と c の高さが縮む
  const down = planPlace(full, "n", r(960, 100), PAPER, floor({ b: { w: 64, h: 28 }, c: { w: 64, h: 28 } }))!
  const [db, dc] = [down.get("b")!, down.get("c")!]
  expect(db).toMatchObject({ x: 1000, y: 160 + GAP, w: 120 })
  expect(db.h).toBeLessThan(60)
  expect(dc.y + dc.h).toBeLessThanOrEqual(PAPER.h)
})

// 組ごとの間隔: a と b の組だけ 32、ほかは 8
const pairGap = (a: string, b: string) => ([a, b].sort().join() === "a,b" ? 32 : GAP)

test("組ごとの間隔: 押すときは、その組の間隔を空ける（線でつながった組は広い）", () => {
  const before = rects({ a: r(100, 100), b: r(240, 100), c: r(380, 100) })
  const after = pushFrom(before, "a", r(100, 100, 150), PAPER, undefined, pairGap)!
  expect(after.get("b")).toEqual(r(250 + 32, 100))
  expect(after.get("c")).toEqual(r(250 + 32 + 100 + GAP, 100))
  // 置いたときも、組の間隔で押す
  const placed = planPlace(rects({ b: r(200, 100) }), "a", r(100, 100), PAPER, new Map(), pairGap)!
  expect(placed.get("b")).toEqual(r(200 + 32, 100))
})
