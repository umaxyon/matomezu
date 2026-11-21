// 窓の書庫の表は、ホストの行を常駐のエンジンと同じ readLibrary で読んだ表: ブックの外のページ・バインダも表に入り、書庫が対象のアクションが窓でも通る
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { readLibrary } from "../../web/src/core/book"
import { HOME_ID, type HomeFolder, type PlainFolder, TRASH_ID } from "../../web/src/core/folders"
import { withChanges } from "../../web/src/core/folders-changes"
import { LIBRARY_HISTORY } from "../../web/src/core/history"
import { performIn } from "../../web/src/core/perform-world"
import { libraryRevertArgs } from "../../web/src/plugins/base/library/revert"
import { foundRowsOf } from "../../web/src/plugins/base/library/search"
import { LIBRARY_FOLDER, LIBRARY_UNFOLDED } from "../../web/src/plugins/base/library/state"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, NAMING, NO_BOOK_SCREEN, newStore, savedRows, sequence, worldRows } from "../support"

const MOVE = "@matomezu/base:entry-move"
const CENTER = "@matomezu/control-center:screen"
const CONTENT_AREA = "@matomezu/control-center:content-area"

const b1 = testBook("b1", "ブック", [drawingPage("p1", { title: "中" })])
const x1 = drawingPage("x1", { title: "外" })
const lb = testBinder("lb", "束", SLIDE, testPage(SLIDE, "y1", { title: "一" }), testPage(SLIDE, "y2", { title: "二" }))
const a: PlainFolder = { folderRole: "folder", id: "a", title: "あ", lineup: [] }

// ブック b1 と、ブックの外のページ x1・バインダ lb と、空のフォルダ a を書庫ホームの直下に置いた行を受けた窓
function received() {
  const outside = worldRows([b1], [x1, lb])
  const folders = outside.folders.map(f => {
    const home = f as HomeFolder
    return home.id === HOME_ID ? { ...home, lineup: [...home.lineup, { kind: "folder", id: "a" }] } : f
  })
  const rows = { pages: outside.pages, folders: [...folders, a] }
  const store = newStore({ books: [], bookScreen: NO_BOOK_SCREEN, now: () => "2026-11-21T00:00:00.000Z" })
  store.receive({ ...rows, settings: {} }, [])
  return { store, rows }
}

const tablesOf = (store: ReturnType<typeof newStore>) => {
  const { pages, folders } = store.state.getState()
  return { pages, folders }
}

test("外のページ・バインダの行を受けた窓の書庫の表は、readLibrary の表と同じ（機能台帳を組み直した後も）", () => {
  const { store, rows } = received()
  const read = readLibrary(store.catalog.core, rows.pages, rows.folders)
  expect(tablesOf(store)).toEqual(read.library as never)
  expect(Object.keys(store.state.getState().pages)).toEqual(expect.arrayContaining(["x1", "y1", "y2"]))
  expect(Object.keys(store.state.getState().folders)).toEqual(expect.arrayContaining(["lb", "a"]))
  store.use([])
  expect(tablesOf(store)).toEqual(readLibrary(store.catalog.core, rows.pages, rows.folders).library as never)
})

test("外のページが在る窓で entry-move が通り、ホストのエンジンの答えと同じ表になり、元に戻す・やり直すができる", async () => {
  const { store, rows } = received()
  const before = tablesOf(store)
  const done = store.actions.perform(MOVE, { entry: "x1", into: "a" })
  expect(done.ok).toBe(true)
  await Promise.resolve()
  const read = readLibrary(CORE_CATALOG, rows.pages, rows.folders).library
  const ctx = {
    catalog: store.catalog.core,
    controlCenter: store.controlCenter,
    lang: "ja" as const,
    newId: sequence(),
    now: "2026-11-21T00:00:00.000Z",
    today: "2026-11-21",
    actor: USER,
  }
  const host = performIn(
    { ...read, settings: {}, annotations: {}, records: {}, counters: {} },
    MOVE,
    { entry: "x1", into: "a" },
    undefined,
    ctx,
  )
  expect(host.ok).toBe(true)
  const after = host.ok && host.changes ? withChanges(read, host.changes) : read
  expect(tablesOf(store)).toEqual(after as never)
  expect(store.state.getState().folders[HOME_ID]?.lineup.map(r => r.id)).toEqual(["b1", "lb", "a"])
  const history = () => store.state.getState().history[LIBRARY_HISTORY] ?? { undo: [], redo: [] }
  const move = (from: "undo" | "redo") => {
    const step = history()[from].at(-1)
    if (!step) return { ok: false as const }
    const back = store.actions.perform(
      "@matomezu/base:library-revert",
      libraryRevertArgs(step, from === "undo" ? "before" : "after"),
    )
    if (back.ok) store.actions.moveHistory(LIBRARY_HISTORY, from)
    return back
  }
  expect(move("undo").ok).toBe(true)
  await Promise.resolve()
  expect(tablesOf(store)).toEqual(before)
  expect(move("redo").ok).toBe(true)
  await Promise.resolve()
  expect(tablesOf(store)).toEqual(after as never)
})

test("受けた行の読めないブックの warning は常駐と同じ（checkBooks）: オブジェクトでない行も読めないブックにし、warning は行の順、id の重なりで読めないブックの問題は partial に入れない", () => {
  const first = testBook("d1", "先", [drawingPage("q1", { title: "1" })])
  // 先のブックと同じ id で、機能台帳に無いアイテムを持つ（読めれば partial に W007 が入る）
  const twin = testBook("d1", "後", [
    drawingPage("q2", { title: "2", items: [{ id: "s", item: "@foo/stars:star", x: 0, y: 0, props: {} }] }),
  ])
  const broken = { id: "d2", title: "壊れた", lineup: "?" }
  const rows = savedRows([first, twin, broken])
  const store = newStore({ books: [], bookScreen: NO_BOOK_SCREEN })
  store.receive({ pages: rows.pages, folders: [...rows.folders, 42], settings: {} }, [])
  const { unreadable, partial, books } = store.state.getState()
  expect(unreadable.map(w => [w.code, w.params.book])).toEqual([
    ["W006", "d1"],
    ["W005", "d2"],
    ["W005", ""],
  ])
  expect(partial).toEqual([])
  expect(Object.keys(books)).toEqual(["d1"])
  expect(unreadable).toEqual(readLibrary(store.catalog.core, rows.pages, [...rows.folders, 42]).warnings as never)
})

test("窓で、外のページの名前を変え・ゴミ箱に入れられ、書庫の検索は外のページ・バインダ・中のページを見つける", async () => {
  const { store } = received()
  expect(store.actions.perform("@matomezu/base:entry-rename", { entry: "x1", title: "外の新" }).ok).toBe(true)
  await Promise.resolve()
  expect(store.state.getState().pages.x1?.title).toBe("外の新")
  const found = foundRowsOf(tablesOf(store), "外の新", NAMING).map(r => [r.id, r.holder])
  expect(found).toEqual([["x1", HOME_ID]])
  expect(foundRowsOf(tablesOf(store), "一", NAMING).map(r => [r.id, r.holder])).toEqual([["y1", "lb"]])
  expect(foundRowsOf(tablesOf(store), "束", NAMING).map(r => r.id)).toEqual(["lb"])
  expect(store.actions.perform("@matomezu/base:entry-trash", { entry: "x1" }).ok).toBe(true)
  await Promise.resolve()
  expect(store.state.getState().folders[TRASH_ID]?.lineup.map(r => r.id)).toEqual(["x1"])
  expect(foundRowsOf(tablesOf(store), "外の新", NAMING)).toEqual([])
})

test("AI が外のページを動かした変更は、まだ見ていない書庫の変更になり、書庫の画面がホームを見せたら書庫の履歴に入る", () => {
  const here = received().store
  const there = received().store
  const was = there.state.getState()
  expect(there.actions.perform(MOVE, { entry: "x1", into: "a" }).ok).toBe(true)
  const now = there.state.getState()
  const folders = Object.fromEntries(
    [HOME_ID, "a"].map(id => [id, { before: was.folders[id], after: now.folders[id] }]),
  )
  here.receive({ pages: Object.values(now.pages), folders: Object.values(now.folders), settings: {} }, [], {
    by: "ai",
    act: "1",
    actions: [MOVE],
    library: { pages: {}, folders },
  })
  expect(here.state.getState().folders.a?.lineup.map(r => r.id)).toEqual(["x1"])
  const center = here.state.getState().window.screens.find(s => s.def === CENTER)?.id as string
  here.actions.makeScreenCurrent(center)
  here.setPluginState(LIBRARY_FOLDER.id, center, HOME_ID)
  here.setPluginState(LIBRARY_UNFOLDED.id, center, [HOME_ID])
  here.setPluginState(CONTENT_AREA, center, "library")
  expect(here.state.getState().history[LIBRARY_HISTORY]?.undo).toMatchObject([{ by: "ai" }])
})
