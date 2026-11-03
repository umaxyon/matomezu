// 右サイドパネルで開いた物を見せる見え方（倍率の選び方と、真ん中に来ること。ずらす量の細かな決まりは stand-place.test.ts）、閉じたときに見え方を戻すかの覚え（state.ts・reveal.ts）。全体を収めるのと同じ移し方（moveView）
import { expect, test } from "bun:test"
import type { Rect } from "../../web/src/core/geom"
import { newStage, openBook, panBy, placement, resize, type Stage, zoomTo } from "../../web/src/core/stage"
import { paperRectOf, revealView } from "../../web/src/plugins/base/right-side-panel/reveal"
import {
  movedFrom,
  restoreIn,
  restoreTo,
  withOpened,
  withoutRestore,
  withPanel,
  withRestore,
} from "../../web/src/plugins/base/right-side-panel/state"
import { fitView, moveView, ZOOM_MIN } from "../../web/src/plugins/base/zoom"
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

test("開くと、開く前の見え方を覚え、物はまだ見せていない。閉じて戻す前に同じページで開き直しても、最初に開く前の見え方と、変えたかはそのまま", () => {
  const opened = withOpened({ noteDraft: 1 }, OPEN, PANNED)
  expect(restoreIn(opened)).toEqual({ before: { ...PANNED, book: "b1", page: "p1" }, shown: null, moved: false })
  const shown = withRestore(withPanel(opened, null), { shown: HOME, moved: true })
  const again = withOpened(shown, { ...OPEN, subject: "c2" }, HOME)
  expect(restoreIn(again)).toEqual({ before: { ...PANNED, book: "b1", page: "p1" }, shown: null, moved: true })
  expect(withoutRestore(withPanel(again, null))).toEqual({ noteDraft: 1 })
  // ほかのページで開き直したら、そのとき開く前の見え方を覚え直す
  const other = withOpened(shown, { ...OPEN, page: "p2" }, HOME)
  expect(restoreIn(other)?.before).toEqual({ ...HOME, book: "b1", page: "p2" })
})

test("見せたあとに倍率かずらす量が変わったら、変えたことにする。見せる前と、表示領域の大きさが変わって収め直されただけのときは数えない", () => {
  const panned = panBy(stage, -300, -200)
  const restore = restoreIn(withOpened({}, OPEN, PANNED))!
  expect(movedFrom(restore, panned)).toBe(false)
  const shown = { ...restore, shown: { zoom: panned.zoom, pan: panned.pan } }
  expect(movedFrom(shown, panned)).toBe(false)
  expect(movedFrom(shown, resize(panned, { w: 900, h: 700 }))).toBe(false)
  expect(movedFrom(shown, panBy(panned, 0, -5))).toBe(true)
  expect(movedFrom(shown, zoomTo(panned, 1.1))).toBe(true)
  expect(movedFrom({ ...shown, moved: true }, panned)).toBe(true)
})

test("閉じたら、変えていなければ開く前の見え方に戻す。変えたか、ほかのブックかページを開いているか、別のステージで開いていれば戻さない", () => {
  const restore = { ...restoreIn(withOpened({}, OPEN, PANNED))!, shown: HOME }
  const on = { opened: { book: "b1", page: "p1" } as never }
  expect(restoreTo(restore, on)).toEqual(PANNED)
  expect(restoreTo(restore, on, true)).toBeNull()
  expect(restoreTo({ ...restore, moved: true }, on)).toBeNull()
  expect(restoreTo(restore, { opened: { book: "b1", page: "p2" } as never })).toBeNull()
  expect(restoreTo(restore, { opened: null })).toBeNull()
})

// 紙の上の四角 rect が、見え方 view で表示領域のどこに来るか
const onView = (s: Stage, view: { zoom: number; pan: { x: number; y: number } }, r: { x: number; y: number }) => {
  const at = placement({ ...s, ...view })!
  return { x: at.x + r.x * at.zoom, y: at.y + r.y * at.zoom }
}

// 見え方 view で、紙の上の四角 r の真ん中が表示領域のどこに来るか
const middleOn = (s: Stage, view: { zoom: number; pan: { x: number; y: number } }, r: Rect) => {
  const at = onView(s, view, r)
  return { x: at.x + (r.w * view.zoom) / 2, y: at.y + (r.h * view.zoom) / 2 }
}

test("1 つの物を見せる見え方は倍率 100% で、物の真ん中を表示領域の真ん中へ動かす", () => {
  const far = { x: 900, y: 500, w: 60, h: 40 }
  const zoomed = zoomTo(stage, 0.6)
  const view = revealView(zoomed, far)
  expect(view.zoom).toBe(1)
  expect(middleOn(zoomed, view, far)).toEqual({ x: 200, y: 150 })
})

test("いくつかの物を囲む四角は、余白を残して入る倍率（100% が上限、ZOOM_MIN が下限）にして真ん中へ動かす", () => {
  const wide = { x: 200, y: 300, w: 704, h: 100 }
  const fitted = revealView(stage, wide, true)
  expect(fitted.zoom).toBe(0.5)
  expect(middleOn(stage, fitted, wide)).toEqual({ x: 200, y: 150 })
  expect(revealView(stage, { x: 900, y: 500, w: 60, h: 40 }, true).zoom).toBe(1)
  expect(revealView(stage, { x: 0, y: 0, w: 5000, h: 100 }, true).zoom).toBe(ZOOM_MIN)
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

test("表示領域の上で測った四角を、紙の上の四角に直す", () => {
  const s = zoomTo(stage, 0.5)
  const at = placement(s)!
  expect(paperRectOf(s, { x: at.x + 50, y: at.y + 20, w: 30, h: 10 })).toEqual({ x: 100, y: 40, w: 60, h: 20 })
})
