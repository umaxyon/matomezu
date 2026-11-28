// 窓が中身を持つ物（core/held.ts の heldEntriesIn）: 開いているステージエントリと、参照エントリの指す先・スクラップの元のステージエントリを、たどった先まで

import { expect, test } from "bun:test"
import { pageMetaRowOf } from "../../web/src/core/folders"
import { heldEntriesIn } from "../../web/src/core/held"
import type { AnyPage } from "../../web/src/core/schema/book"
import { SCRAP_BOX } from "../../web/src/plugins/items/scrap"
import { drawingPage, testBook } from "../lineup"
import { sizedStore, worldRows } from "../support"

const scrapOf = (id: string, page: string) => ({
  id,
  item: SCRAP_BOX.id,
  x: 0,
  y: 0,
  props: { page, area: { x: 0, y: 0, w: 10, h: 10 }, scale: 1 },
})

// b1 を開いた窓。b1 は b3 のページを参照し、b1 のページのスクラップは b2 のページを、b2 のページのスクラップは b5 のページを描く。b4 はどこからも使わない
function opened(meta: readonly string[] = []) {
  const store = sizedStore()
  const rows = worldRows([
    testBook("b1", "一", [drawingPage("p1", { items: [scrapOf("x1", "q1")] })]),
    testBook("b2", "二", [drawingPage("q1", { items: [scrapOf("x2", "t1")] })]),
    testBook("b3", "三", [drawingPage("r1")]),
    testBook("b4", "四", [drawingPage("u1")]),
    testBook("b5", "五", [drawingPage("t1")]),
  ])
  const ref = { kind: "reference", id: "ref1", of: { kind: "page", id: "r1" } }
  store.receive(
    {
      pages: rows.pages.map(p => (meta.includes((p as { id: string }).id) ? pageMetaRowOf(p as AnyPage) : p)),
      folders: rows.folders.map(f =>
        (f as { id: string }).id === "b1"
          ? { ...(f as object), lineup: [...(f as { lineup: object[] }).lineup, ref] }
          : f,
      ),
      settings: {},
    },
    [],
  )
  return store
}

test("開いているブックと、その参照エントリの指す先・スクラップの元を、スクラップの元のスクラップの元までたどって持つ", () => {
  const store = opened()
  const s = store.state.getState()
  expect(s.window.screens.flatMap(sc => sc.stages?.stages ?? []).map(st => st.opened)).toMatchObject([
    { outermost: { id: "b1" } },
  ])
  expect(heldEntriesIn(store.catalog.core, s, s.window)).toEqual(["b1", "b2", "b3", "b5"])
})

test("何も開いていない窓は、何も持たない", () => {
  const store = opened()
  const s = store.state.getState()
  const win = { ...s.window, screens: s.window.screens.map(sc => ({ ...sc, stages: undefined })) }
  expect(heldEntriesIn(store.catalog.core, s, win)).toEqual([])
})

test("中身を持っていないページの形からはたどらない（中身を持ってから、もう一度決める）", () => {
  const store = opened(["q1"])
  const s = store.state.getState()
  expect(heldEntriesIn(store.catalog.core, s, s.window)).toEqual(["b1", "b2", "b3"])
})
