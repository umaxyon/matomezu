// 線をじかに直す決まり（drawing/line/edit.ts）と、端のつなぎ替え（line.reconnect）

import { expect, test } from "bun:test"
import { rectsOf, shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { reconnectTargets } from "../../web/src/plugins/items/line/connect"
import { drawLines } from "../../web/src/plugins/items/line/drawn"
import { captionDragged, endDragged, viaDragged, viaSettled } from "../../web/src/plugins/items/line/edit"
import { linesOf } from "../../web/src/plugins/items/line/placed"
import { newStore, REGISTRY } from "../support"

function ready(boxes: [number, number][]) {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  for (const [x, y] of boxes)
    store.actions.perform("item.place", { page: "p1", item: "shape.box", at: { x, y }, w: 100, h: 64 }, { book: "b1" })
  return store
}
type Store = ReturnType<typeof ready>
const page = (store: Store) => (store.state.getState().books.b1 as BookOf<"drawing">).pages[0]!
const connect = (store: Store, from: string, to: string, props: Record<string, unknown> = {}) =>
  store.actions.perform("line.connect", { page: "p1", from, to, props }, { book: "b1" })
const scene = (store: Store) => {
  const p = page(store)
  const rects = rectsOf(REGISTRY, p)
  return { lines: linesOf(p), rects, drawn: drawLines(linesOf(p), rects, true) }
}

test("区間のドラッグ: 自動の形なら両端を今の位置に固定して、区間を動かせる範囲に収めて動かす。離したら長さ 0 の区間をまとめる", () => {
  const store = ready([
    [100, 100],
    [400, 300],
  ])
  connect(store, "n1", "n2", { exitAt: 132 / 328, enterAt: 296 / 328 }) // n1 の右から n2 の左へ、Z 字
  const { lines, rects, drawn } = scene(store)
  const line = lines[0]!
  const d = drawn[0]!
  expect(d.segments).toEqual([{ index: 0, axis: "x", lo: 212, hi: 388 }])
  expect(viaDragged(line, d, rects, 0, 260)!.via).toEqual([260])
  expect(viaDragged(line, d, rects, 0, 900)!.via).toEqual([388]) // 範囲に収める
  expect(viaDragged(line, d, rects, 3, 260)).toBeNull()
  // 自動の形（端が自由）でも、両端を今の位置に固定してから動かす
  // n2 を、横の隙間に比べて縦の隙間が小さい所に置くと、自動の形は Z 字
  const zRects = new Map([...rects, ["n2", { x: 400, y: 200, w: 100, h: 64 }]])
  const free = { ...line, props: {} }
  const fd = drawLines([free], zRects, true)[0]!
  expect(fd.segments).toHaveLength(1)
  const moved = viaDragged(free, fd, zRects, 0, 300)!
  expect(moved.exitAt).toBeDefined()
  expect(moved.enterAt).toBeDefined()
  expect(viaSettled({ ...line, props: { ...line.props, via: [300] } }, d, rects, true).via).toEqual([300])
})

test("端のドラッグ: ポインタに一番近いふちの位置に固定する。同じ箱のほかの線の端に 8px まで近づくと、その点に吸い付く", () => {
  const store = ready([
    [100, 100],
    [400, 100],
    [400, 300],
  ])
  connect(store, "n1", "n2") // n1 の右の辺の真ん中から
  connect(store, "n1", "n3", { exitAt: 132 / 328 }) // n1 の右の辺の真ん中（y = 132）から
  const { lines, rects, drawn } = scene(store)
  const l = lines.find(x => x.to === "n3")!
  // n1 の下の辺の x = 150 の近く（ふち一周 328 の上で、下の辺は右から左へ 164〜264）
  const down = endDragged(l, "exit", lines, drawn, rects, { x: 150, y: 175 })!
  expect(down.snap).toBeNull()
  expect(down.props.exitAt).toBeCloseTo(214 / 328, 3)
  // n1 の右の辺の、もう 1 本の線の端（y = 132）の 5px 上
  const n2line = drawn.find(x => x.id === lines.find(y => y.to === "n2")!.id)!
  const near = endDragged(l, "exit", lines, drawn, rects, { x: 205, y: n2line.points[0]!.y - 5 })!
  expect(near.snap).toEqual(n2line.points[0]!)
})

test("キャプションのドラッグ: 線に沿った位置と、線から離す量（左が正。±60 まで）", () => {
  const store = ready([
    [100, 100],
    [400, 100],
  ])
  connect(store, "n1", "n2", { caption: "申請" })
  const { lines, drawn } = scene(store)
  // 線は (200,132) から (400,132)。x = 250 は 4 分の 1、上へ 20 は左（右向きの線）
  expect(captionDragged(lines[0]!, drawn[0]!.points, { x: 250, y: 112 })).toMatchObject({
    captionAt: 0.25,
    captionOffset: 20,
  })
  expect(captionDragged(lines[0]!, drawn[0]!.points, { x: 250, y: 300 }).captionOffset).toBe(-60)
})

test("つなぎ替え: 端を別の箱へ移し、キャプション・端の形は残し、via と移した端の位置を捨てる。もう一方の端と組の線がある箱へは移せない", () => {
  const store = ready([
    [100, 100],
    [400, 300],
    [700, 100],
  ])
  connect(store, "n1", "n2", { exitAt: 132 / 328, enterAt: 296 / 328, via: [300], caption: "申請", endHead: "arrow" })
  connect(store, "n1", "n3")
  const line = () => linesOf(page(store)).find(l => l.id === "n4")!
  expect([...reconnectTargets(REGISTRY, page(store), line(), "to")]).toEqual(["n1"]) // n3 は n1 と組の線がある
  expect([...reconnectTargets(REGISTRY, page(store), line(), "from")]).toEqual(["n2", "n3"]) // n2 なら自分に戻る線
  const re = (end: "from" | "to", item: string, props?: Record<string, number>) =>
    store.actions.perform(
      "line.reconnect",
      { page: "p1", line: "n4", end, item, ...(props ? { props } : {}) },
      { book: "b1" },
    )
  expect(re("to", "n3").ok).toBe(false)
  expect(re("from", "n3", { exitAt: 0.5 }).ok).toBe(true)
  expect(line()).toMatchObject({
    from: "n3",
    to: "n2",
    props: { exitAt: 0.5, enterAt: 296 / 328, caption: "申請", endHead: "arrow" },
  })
  expect(line().props.via).toBeUndefined()
  // もう一方の端と同じ箱へ移すと自分に戻る線になり、両端の位置を捨てる
  expect(re("from", "n2").ok).toBe(true)
  expect(line()).toMatchObject({ from: "n2", to: "n2" })
  expect(line().props.exitAt).toBeUndefined()
  expect(line().props.enterAt).toBeUndefined()
})

test("つなぎ替えた先の箱はそのままで、近すぎればもう一方の箱をどける", () => {
  const store = ready([
    [100, 100],
    [400, 300],
    [220, 100],
  ])
  connect(store, "n1", "n2") // 線は n4
  // n3 は n1 の右に 20 離れて並ぶ。n1 から n3 へつなぎ替えると 32 空けるので、n3 はそのままで n1 を左へどける
  expect(
    store.actions.perform("line.reconnect", { page: "p1", line: "n4", end: "to", item: "n3" }, { book: "b1" }).ok,
  ).toBe(true)
  expect(shapesOf(page(store)).find(s => s.id === "n3")).toMatchObject({ x: 220, y: 100 })
  expect(shapesOf(page(store)).find(s => s.id === "n1")).toMatchObject({ x: 220 - 32 - 100, y: 100 })
})
