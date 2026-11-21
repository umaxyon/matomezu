// ブックの外のページを窓に出す（store の showOutsidePageStage）: 開く・そのページを変える・よその変更でゴミ箱に入ると閉じる

import { expect, test } from "bun:test"
import { stagePlacesOf } from "../../web/src/core/address"
import { NO_OUTERMOST } from "../../web/src/core/folders-tree"
import { shownPageId } from "../../web/src/core/stage"
import { stageIn } from "../../web/src/core/window"
import { NO_STAGE } from "../../web/src/store/dialogs"
import type { AIEditTicketOutcome } from "../../web/src/store/state"
import { openedIn } from "../../web/src/store/store"
import { drawingPage } from "../lineup"
import { newStore, sequence, worldRows } from "../support"

type Store = ReturnType<typeof newStore>
const rowsOf = (store: Store) => {
  const { pages, folders } = store.state.getState()
  return { pages: Object.values(pages), folders: Object.values(folders), settings: {} }
}
// 書庫ホームにブックの外のページ o1 が在る世界から始めた store
function withOutside(): Store {
  const store = newStore({ newId: sequence() })
  const books = Object.values(store.state.getState().books)
  store.receive({ ...worldRows(books, [drawingPage("o1", { title: "ブックの外のページ" })]), settings: {} }, [])
  return store
}

test("ブックの外のページを窓に出すと、新しいブックスクリーンのステージで開く。もう開いていれば、そのステージ。開けるブックの外のページでなければ何もしない", () => {
  const store = withOutside()
  const stage = store.actions.showOutsidePageStage("o1")
  expect(stage).not.toBe(NO_STAGE)
  expect(stageIn(store.state.getState().window, stage)?.opened).toMatchObject({
    kind: "page",
    outermost: { kind: "page", id: "o1" },
    page: "o1",
  })
  expect(store.actions.showOutsidePageStage("o1")).toBe(stage)
  const inBook = Object.values(store.state.getState().books)[0]!.lineup[0]!.id
  const before = store.state.getState().window
  expect(store.actions.showOutsidePageStage(inBook)).toBe(NO_STAGE)
  expect(store.actions.showOutsidePageStage("nothing")).toBe(NO_STAGE)
  expect(store.state.getState().window).toBe(before)
})

test("開いているブックの外のページを変えても、ステージはそのページを開いたまま", () => {
  const store = withOutside()
  const stage = store.actions.showOutsidePageStage("o1")
  const done = store.actions.perform("@matomezu/base:page-update", { title: "変えた名前" }, { page: "o1" })
  expect(done.ok).toBe(true)
  expect(store.state.getState().pages.o1).toMatchObject({ title: "変えた名前" })
  expect(openedIn(store, stage)).toEqual({ book: "o1", page: "o1" })
})

test("よその変更で、開いているブックの外のページがゴミ箱に入ると、そのステージは閉じる", () => {
  const here = withOutside()
  const there = withOutside()
  const stage = here.actions.showOutsidePageStage("o1")
  expect(there.actions.perform("@matomezu/base:entry-trash", { entry: "o1" }).ok).toBe(true)
  here.receive(rowsOf(there), [])
  expect(stageIn(here.state.getState().window, stage)).toBeUndefined()
})

test("開いているブックの外のページがブックの中へ移されると、ステージは閉じず、そのブックのページとして開いた形になる", () => {
  const here = withOutside()
  const stage = here.actions.showOutsidePageStage("o1")
  const [book, ...rest] = Object.values(here.state.getState().books)
  const moved = { ...book!, lineup: [...book!.lineup, here.state.getState().pages.o1] }
  here.receive({ ...worldRows([moved, ...rest]), settings: {} }, [])
  expect(stageIn(here.state.getState().window, stage)?.opened).toMatchObject({
    kind: "page",
    outermost: { kind: "book", id: book!.id },
    page: "o1",
  })
})

test("開いているブックの外のページへの AI の変更は、見えたら、そのページの画面の履歴に入り、見えたと知らせる", async () => {
  const told: AIEditTicketOutcome[] = []
  const here = newStore({ newId: sequence(), visible: () => true, aiEditTicket: c => told.push(c) })
  const there = withOutside()
  here.receive(rowsOf(there), [])
  here.actions.showOutsidePageStage("o1")
  expect(there.actions.perform("@matomezu/base:page-update", { title: "AI の名前" }, { page: "o1" }).ok).toBe(true)
  here.receive(rowsOf(there), [], { by: "ai", act: "7", actions: ["@matomezu/base:page-update"] })
  await Promise.resolve()
  expect(told).toEqual([{ act: "7", places: ["o1"], outcome: "seen" }])
  expect(here.state.getState().history.o1?.undo.map(s => [s.by, s.outermosts])).toEqual([["ai", ["o1"]]])
})

test("ブックの外のページを変えると、そのページの画面の履歴に段が入る", async () => {
  const store = withOutside()
  store.actions.showOutsidePageStage("o1")
  store.actions.perform("@matomezu/base:page-update", { title: "変えた名前" }, { page: "o1" })
  await Promise.resolve()
  expect(store.state.getState().history.o1?.undo.map(s => [s.by, s.outermosts, Object.keys(s.pages)])).toEqual([
    ["user", ["o1"], ["o1"]],
  ])
})

test("ブックの外のページの変更を、元に戻し、やり直す", async () => {
  const store = withOutside()
  const stage = store.actions.showOutsidePageStage("o1")
  store.actions.perform("@matomezu/base:page-update", { title: "変えた名前" }, { page: "o1" })
  await Promise.resolve()
  const title = () => store.state.getState().pages.o1?.title
  expect(store.actions.command(stage, "@matomezu/base:undo")).toBe(true)
  await Promise.resolve()
  expect(title()).toBe("ブックの外のページ")
  expect(store.state.getState().history.o1).toMatchObject({ undo: [], redo: [{ outermosts: ["o1"] }] })
  expect(store.actions.command(stage, "@matomezu/base:redo")).toBe(true)
  await Promise.resolve()
  expect(title()).toBe("変えた名前")
  expect(openedIn(store, stage)).toEqual({ book: "o1", page: "o1" })
})

test("ロックしたブックの外のページは、元に戻すが断られ、画面の履歴の段は残る", async () => {
  const store = withOutside()
  const stage = store.actions.showOutsidePageStage("o1")
  store.actions.perform("@matomezu/base:page-update", { title: "変えた名前" }, { page: "o1" })
  await Promise.resolve()
  expect(store.actions.perform("@matomezu/base:page-lock", {}, { page: "o1" }).ok).toBe(true)
  await Promise.resolve()
  store.actions.command(stage, "@matomezu/base:undo")
  await Promise.resolve()
  expect(store.state.getState().pages.o1?.title).toBe("変えた名前")
  expect(store.state.getState().history.o1?.undo).toHaveLength(1)
  expect(store.state.getState().toasts.at(-1)).toMatchObject({
    kind: "warn",
    detail: { params: { name: "変えた名前" } },
  })
})

test("ブックの外のページを開いた画面の場所は、ブックを名指さずページを名指し、当てはめると同じページを開く。ブックの中へ移されていればそのブックのページを開き、開けなければそのステージを開かない", () => {
  const store = withOutside()
  const stage = store.actions.showOutsidePageStage("o1")
  const address = store.address()
  expect(stagePlacesOf(address).map(p => [p.outermost, p.page])).toContainEqual([NO_OUTERMOST, "o1"])
  // 読み直した窓（同じ書庫）に当てはめる
  const again = withOutside()
  again.locate(address)
  const opens = (s: Store) =>
    s.state.getState().window.screens.flatMap(c => c.stages?.stages.map(t => t.opened?.outermost) ?? [])
  expect(opens(again)).toContainEqual({ kind: "page", id: "o1" })
  expect(opens(store)).toContainEqual({ kind: "page", id: "o1" })
  expect(stage).not.toBe(NO_STAGE)
  // その間にブックの中へ移されていれば、そのブックのページとして開く
  const moved = newStore({ newId: sequence() })
  const [book, ...rest] = Object.values(moved.state.getState().books)
  const into = { ...book!, lineup: [...book!.lineup, drawingPage("o1", { title: "ブックの外のページ" })] }
  moved.receive({ ...worldRows([into, ...rest]), settings: {} }, [])
  moved.locate(address)
  const at = moved.state.getState().window.screens.flatMap(c => c.stages?.stages ?? [])
  expect(at.map(t => [t.opened?.outermost, shownPageId(t.opened)])).toContainEqual([
    { kind: "book", id: book!.id },
    "o1",
  ])
  // 無くなっていれば、そのステージは開かない
  const gone = newStore({ newId: sequence() })
  const before = gone.state.getState().window
  gone.locate(address)
  expect(opens(gone)).not.toContainEqual({ kind: "page", id: "o1" })
  expect(gone.state.getState().window.screens.length).toBe(before.screens.length)
})
