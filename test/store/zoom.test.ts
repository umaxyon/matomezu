// base の拡大縮小のコマンド（zoom-in・zoom-out・zoom-reset・zoom-fit）と、倍率の範囲
import { expect, test } from "bun:test"
import type { ItemPage } from "../../web/src/core/placed"
import { paperOf } from "../../web/src/core/stage"
import { MARGIN } from "../../web/src/core/viewport"
import { roomOf } from "../../web/src/plugins/base/place/items"
import { startOf } from "../../web/src/plugins/base/print-preview/book-sheets"
import { stepZoom, wheelZoom, ZOOM_MAX, ZOOM_MIN } from "../../web/src/plugins/base/zoom"
import type { CommandId } from "../../web/src/store/commands"
import { isEnabled } from "../../web/src/store/commands"
import { newStore } from "../support"

test("倍率は 30～180% の無段階。ボタンは 10% の倍数へ 1 つずつ動き（間なら近い向きの倍数へ）、ホイールは回した量に合わせて滑らかに変える", () => {
  expect(stepZoom(1, 1)).toBe(1.1)
  expect(stepZoom(1, -1)).toBe(0.9)
  expect(stepZoom(1.03, 1)).toBe(1.1)
  expect(stepZoom(1.03, -1)).toBe(1)
  expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
  expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  expect(stepZoom(0.35, -1)).toBe(ZOOM_MIN)
  const up = wheelZoom(1, -10)
  expect(up).toBeGreaterThan(1)
  expect(up).toBeLessThan(1.1)
  expect(wheelZoom(1, 100)).toBeLessThan(1)
  expect(wheelZoom(1, -100000)).toBe(ZOOM_MAX)
  expect(wheelZoom(1, 100000)).toBe(ZOOM_MIN)
})

test("拡大・縮小は範囲の端で押せず、初めの位置に戻すは開いたときの見え方では押せない", () => {
  const store = newStore()
  const { state, actions } = store
  actions.resizeStage("s1", { w: 400, h: 300 })
  const zoom = () => state.getState().workspace.stages[0]!.zoom
  const enabled = (id: CommandId) => isEnabled(store, state.getState(), "s1", id)
  expect(enabled("@matomezu/base:zoom-reset")).toBe(false)
  actions.command("s1", "@matomezu/base:zoom-in", null)
  expect([zoom(), enabled("@matomezu/base:zoom-reset")]).toEqual([1.1, true])
  for (const _ of Array(20)) actions.command("s1", "@matomezu/base:zoom-in", null)
  expect([zoom(), enabled("@matomezu/base:zoom-in")]).toEqual([ZOOM_MAX, false])
  for (const _ of Array(30)) actions.command("s1", "@matomezu/base:zoom-out", null)
  expect([zoom(), enabled("@matomezu/base:zoom-out")]).toEqual([ZOOM_MIN, false])
  expect(actions.pressKey("Home")).toBe(true)
  expect([zoom(), enabled("@matomezu/base:zoom-reset")]).toEqual([1, false])
})

test("ページ全体を収めると、紙が表示領域に入る倍率にして真ん中に置く。30% より小さくはしない。収めた見え方では押せない", () => {
  const store = newStore()
  const { state, actions } = store
  const stage = () => state.getState().workspace.stages[0]!
  const enabled = () => isEnabled(store, state.getState(), "s1", "@matomezu/base:zoom-fit")
  actions.resizeStage("s1", { w: 800, h: 600 })
  const paper = paperOf(stage())!
  expect(enabled()).toBe(true)
  actions.command("s1", "@matomezu/base:zoom-fit")
  const z = stage().zoom
  expect(paper.w * z).toBeLessThanOrEqual(800)
  expect(paper.h * z).toBeLessThanOrEqual(600)
  // 紙の真ん中が表示領域の真ん中
  const center = (view: number, pan: number, size: number) => pan + MARGIN + (size * z) / 2 - view / 2
  expect(Math.abs(center(800, stage().pan.x, paper.w))).toBeLessThan(1)
  expect(Math.abs(center(600, stage().pan.y, paper.h))).toBeLessThan(1)
  expect(enabled()).toBe(false)
  // 小さな表示領域では 30% で止める
  actions.resizeStage("s1", { w: 120, h: 90 })
  actions.command("s1", "@matomezu/base:zoom-fit")
  expect(stage().zoom).toBe(ZOOM_MIN)
})

test("Ctrl+ホイールのコマンドは、回した量を今の倍率に重ねる（続けて回すと重なる）。範囲の外へは出ない", () => {
  const store = newStore()
  const { state, actions } = store
  actions.resizeStage("s1", { w: 800, h: 600 })
  const zoom = () => state.getState().workspace.stages[0]!.zoom
  const at = { x: 400, y: 300 }
  actions.command("s1", "@matomezu/base:zoom-wheel", { delta: -100, at })
  const once = zoom()
  expect(once).toBe(wheelZoom(1, -100))
  actions.command("s1", "@matomezu/base:zoom-wheel", { delta: -100, at })
  expect(zoom()).toBe(wheelZoom(once, -100))
  actions.command("s1", "@matomezu/base:zoom-wheel", { delta: 100000, at })
  expect(zoom()).toBe(ZOOM_MIN)
})

test("左と上へ増やす可変ページは、開くと、空きの印刷区画でなく中身の載った印刷区画の左上を表示領域の左上に置き、初めの位置に戻すもそこへ戻す", () => {
  const store = newStore()
  const { state, actions, catalog } = store
  const enabled = () => isEnabled(store, state.getState(), "s1", "@matomezu/base:zoom-reset")
  const stage = () => state.getState().workspace.stages[0]!
  actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at: { x: 100, y: 100 } },
    { book: "b1" },
  )
  expect(actions.perform("@matomezu/base:page-update", { page: "p1", grows: "all" }, { book: "b1" }).ok).toBe(true)
  // 開き直し、表示領域を測って、見せ方とレイヤーが広さと初めの位置を知らせる（左と上の印刷区画は空き）
  actions.openBook("s1", "b1")
  actions.openPage("s1", "p2")
  actions.openPage("s1", "p1")
  actions.resizeStage("s1", { w: 800, h: 600 })
  const book = state.getState().books.b1!
  const page = (book as { pages: readonly ItemPage[] }).pages.find(p => p.id === "p1")!
  const sheet = paperOf(stage())!
  const start = startOf(catalog.core, book, page)
  expect(start).toEqual({ x: sheet.w, y: sheet.h })
  actions.setStageArea("s1", roomOf(catalog.core, book, page))
  actions.setStageStart("s1", start)
  expect(stage().pan).toEqual({ x: -sheet.w, y: -sheet.h })
  expect(enabled()).toBe(false)
  // 動かしてから戻すと、同じ所へ戻る
  actions.panStageBy("s1", 300, 200)
  actions.command("s1", "@matomezu/base:zoom-in", null)
  expect(enabled()).toBe(true)
  actions.command("s1", "@matomezu/base:zoom-reset")
  expect([stage().zoom, stage().pan]).toEqual([1, { x: -sheet.w, y: -sheet.h }])
})

test("ツリーの可変ページも、左へ増やす向きなら左の印刷区画が空きで、初めの位置はその右の印刷区画の左上", () => {
  const { catalog } = newStore()
  const children = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, caption: `子 ${i}` }))
  const page = {
    id: "p1",
    title: "1",
    paper: "@matomezu/base:a4",
    orientation: "landscape" as const,
    grows: true as const,
    root: { id: "r", caption: "根", children },
  }
  const tree = { type: "@matomezu/tree:tree" as const, id: "t1", title: "木", pages: [page] }
  expect(startOf(catalog.core, tree as never, page as never)).toEqual({ x: 1123, y: 0 })
  // 中身の無いページ・可変ページでないページは紙の左上
  const plain = { id: "p2", title: "2", paper: "@matomezu/base:a4", orientation: "landscape" as const, items: [] }
  const drawing = { type: "@matomezu/drawing:drawing" as const, id: "d1", title: "図", pages: [plain] }
  expect(startOf(catalog.core, drawing as never, plain as never)).toEqual({ x: 0, y: 0 })
})
