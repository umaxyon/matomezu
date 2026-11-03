// 右サイドパネルで開いた物を見せる見え方と、閉じたときに見え方を戻すかの覚え（state.ts・reveal.ts）。全体を収めるのと同じ移し方（moveView）
import { expect, test } from "bun:test"
import { newStage, openBook, panBy, placement, resize, type Stage, zoomTo } from "../../web/src/core/stage"
import { revealView } from "../../web/src/plugins/base/right-side-panel/reveal"
import {
  movedFrom,
  restoreIn,
  restoreTo,
  withOpened,
  withoutRestore,
  withPanel,
  withRestore,
} from "../../web/src/plugins/base/right-side-panel/state"
import { fitView, moveView } from "../../web/src/plugins/base/zoom"
import { CORE_CATALOG } from "../support"

const OPEN = { widget: "p:panel", subject: "c1", anchor: "a1", book: "b1", page: "p1" }
const HOME = { zoom: 1, pan: { x: 0, y: 0 } }
const PANNED = { zoom: 0.8, pan: { x: -40, y: -10 } }

const book = {
  type: "@matomezu/drawing:drawing" as const,
  id: "b1",
  title: "見本",
  pages: [{ id: "p1", title: "ページ 1", paper: "@matomezu/base:a4", orientation: "landscape" as const }],
}
const stage = resize(openBook(CORE_CATALOG, newStage("s1"), book), { w: 400, h: 300 })

test("開くと、開く前の見え方を覚え、物はまだ見せていない。閉じて戻す前に開き直しても、最初に開く前の見え方のまま", () => {
  const opened = withOpened({ commentDraft: 1 }, OPEN, PANNED)
  expect(restoreIn(opened)).toEqual({ before: { ...PANNED, book: "b1", page: "p1" }, shown: null, moved: false })
  const shown = withRestore(withPanel(opened, null), { shown: HOME, moved: true })
  const again = withOpened(shown, { ...OPEN, subject: "c2" }, HOME)
  expect(restoreIn(again)).toEqual({ before: { ...PANNED, book: "b1", page: "p1" }, shown: null, moved: false })
  expect(withoutRestore(withPanel(again, null))).toEqual({ commentDraft: 1 })
})

test("見せたあとに倍率かずらす量が変わったら、変えたことにする。見せる前は数えない", () => {
  const restore = restoreIn(withOpened({}, OPEN, PANNED))!
  expect(movedFrom(restore, HOME)).toBe(false)
  const shown = { ...restore, shown: HOME }
  expect(movedFrom(shown, HOME)).toBe(false)
  expect(movedFrom(shown, { zoom: 1, pan: { x: 0, y: -5 } })).toBe(true)
  expect(movedFrom(shown, { ...HOME, zoom: 1.1 })).toBe(true)
  expect(movedFrom({ ...shown, moved: true }, HOME)).toBe(true)
})

test("閉じたら、変えていなければ開く前の見え方に戻す。変えたか、ほかのブックかページを開いていれば戻さない", () => {
  const restore = { ...restoreIn(withOpened({}, OPEN, PANNED))!, shown: HOME }
  const on = { opened: { book: "b1", page: "p1" } as never }
  expect(restoreTo(restore, on)).toEqual(PANNED)
  expect(restoreTo({ ...restore, moved: true }, on)).toBeNull()
  expect(restoreTo(restore, { opened: { book: "b1", page: "p2" } as never })).toBeNull()
  expect(restoreTo(restore, { opened: null })).toBeNull()
})

// 紙の上の四角 rect が、見え方 view で表示領域のどこに来るか
const onView = (s: Stage, view: { zoom: number; pan: { x: number; y: number } }, r: { x: number; y: number }) => {
  const at = placement({ ...s, ...view })!
  return { x: at.x + r.x * at.zoom, y: at.y + r.y * at.zoom }
}

test("物を見せる見え方は倍率 100% で、物が余白を残して表示領域に入る。もう入っていればずらさない", () => {
  const far = { x: 900, y: 500, w: 60, h: 40 }
  const zoomed = zoomTo(stage, 0.6)
  const view = revealView(zoomed, far)
  expect(view.zoom).toBe(1)
  const at = onView(zoomed, view, far)
  expect(at.x).toBeGreaterThanOrEqual(24)
  expect(at.x + far.w).toBeLessThanOrEqual(400 - 24)
  expect(at.y).toBeGreaterThanOrEqual(24)
  expect(at.y + far.h).toBeLessThanOrEqual(300 - 24)
  const near = { x: 20, y: 20, w: 40, h: 40 }
  expect(revealView(stage, near)).toEqual({ zoom: 1, pan: stage.pan })
})

test("物が表示領域より大きければ、物の左上を見せる", () => {
  const big = { x: 300, y: 200, w: 600, h: 500 }
  const view = revealView(panBy(stage, -500, -400), big)
  expect(onView(stage, view, big)).toEqual({ x: 24, y: 24 })
})

test("見え方へ移すと、倍率もずらす量もその見え方になる（全体を収めるのも同じ移し方）", () => {
  let now = panBy(zoomTo(stage, 1.4), -300, -200)
  const actions = {
    zoomStage: (_: string, zoom: number) => {
      now = zoomTo(now, zoom)
    },
    panStageBy: (_: string, dx: number, dy: number) => {
      now = panBy(now, dx, dy)
    },
  }
  const fit = fitView(now)
  moveView(actions, now, fit)
  expect({ zoom: now.zoom, pan: now.pan }).toEqual({ zoom: fit.zoom, pan: fit.pan })
  const target = revealView(now, { x: 800, y: 500, w: 40, h: 40 })
  moveView(actions, now, target)
  expect({ zoom: now.zoom, pan: now.pan }).toEqual(target)
})
