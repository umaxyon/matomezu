// まだ見ていない、AI とほかの窓の書庫の変更: 常駐の知らせ（receive の change）の library に挙がった行（書庫の画面の履歴に入るアクションが変えた物）は、
// ブックの画面の履歴に入れず、まだ見ていない書庫の変更として溜める。変わった物か、それを入れているフォルダを、見えているスクリーンのビューが見せたら、
// 書庫の画面の履歴に時刻の位置で差し込む。置き直しが上書きした、まだ見ていない変更は捨てる

import { expect, test } from "bun:test"
import { HOME_ID, TRASH_ID } from "../../web/src/core/folders"
import { foldersNear, LIBRARY_HISTORY } from "../../web/src/core/history"
import { shownScreens } from "../../web/src/core/window"
import type { AIEditTicketOutcome, ForeignChange } from "../../web/src/store/store"
import { CORE_CATALOG, newStore, sequence } from "../support"

type Store = ReturnType<typeof newStore>
const settled = () => Promise.resolve()
const rowsOf = (store: Store) => {
  const { pages, folders } = store.state.getState()
  return { pages: Object.values(pages), folders: Object.values(folders), settings: {} }
}
const libraryHistory = (store: Store) => store.state.getState().history[LIBRARY_HISTORY] ?? { undo: [], redo: [] }
const titleOf = (store: Store, id: string) => (store.state.getState().folders[id] as { title?: string }).title

// この窓 here と、よそ（AI かほかの窓の代わりに、同じ世界から始めて行う）there。told は、この窓が常駐に知らせた見えた・消えた
function pair() {
  const told: AIEditTicketOutcome[] = []
  let at = 0
  const here = newStore({
    newId: sequence(),
    now: () => `2026-11-18T01:00:${String(at++).padStart(2, "0")}.000Z`,
    aiEditTicket: c => told.push(c),
  })
  const there = newStore({ newId: sequence() })
  here.receive(rowsOf(here), [])
  // よそが do を行い、その後の世界を、この窓に知らせる（library は、書庫の画面の履歴に入るアクションが変えた行）
  const foreign = async (change: Omit<ForeignChange, "books"> & { books?: readonly string[] }, act: () => void) => {
    act()
    await settled()
    here.receive(rowsOf(there), [], { books: ["b1"], ...change })
  }
  const show = (folders: readonly string[] | null) =>
    here.setShownFolders("view", shownScreens(CORE_CATALOG, here.state.getState().window)[0] as string, folders)
  return { here, there, told, foreign, show }
}
const RENAME = "@matomezu/base:entry-rename"

test("AI が書庫のアクションで変えたブックの名前は、ブックの画面の履歴に入らず、入れ物のフォルダを書庫の画面が見せたら、書庫の画面の履歴に入る", async () => {
  const { here, there, told, foreign, show } = pair()
  await foreign({ by: "ai", act: "1", actions: [RENAME], library: { pages: [], folders: ["b1"] } }, () =>
    there.actions.perform(RENAME, { entry: "b1", title: "AI の名前" }),
  )
  expect(titleOf(here, "b1")).toBe("AI の名前")
  expect(here.state.getState().history.b1?.undo ?? []).toEqual([])
  expect(libraryHistory(here).undo).toEqual([])
  // ゴミ箱だけを見せていても、見えない
  show([TRASH_ID])
  expect(libraryHistory(here).undo).toEqual([])
  expect(told).toEqual([])
  show([HOME_ID])
  expect(libraryHistory(here).undo).toMatchObject([{ by: "ai", folders: { b1: {} } }])
  expect(told).toEqual([{ act: "1", places: ["b1"], outcome: "seen" }])
  // 利用者が、書庫の元に戻すで戻せる
  expect(here.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(titleOf(here, "b1")).not.toBe("AI の名前")
})

test("見せているビューが在る間に届いた変更は、すぐ入る。ビューが消えたら、入らない", async () => {
  const { here, there, foreign, show } = pair()
  show([HOME_ID])
  await foreign({ by: "window", act: "1", actions: [RENAME], library: { pages: [], folders: ["b1"] } }, () =>
    there.actions.perform(RENAME, { entry: "b1", title: "一回目" }),
  )
  expect(libraryHistory(here).undo).toMatchObject([{ by: "window" }])
  show(null)
  await foreign({ by: "window", act: "2", actions: [RENAME], library: { pages: [], folders: ["b1"] } }, () =>
    there.actions.perform(RENAME, { entry: "b1", title: "二回目" }),
  )
  expect(libraryHistory(here).undo).toHaveLength(1)
})

test("ほかの窓のアクションバルクにブックの変更と書庫の変更が混ざっていたら、ブックの分はブックの画面の履歴に、書庫の分は書庫の画面の履歴に分かれる", async () => {
  const { here, there, foreign, show } = pair()
  show([HOME_ID])
  const page = Object.keys(there.state.getState().pages)[0] as string
  const PLACE = "@matomezu/paper:item-place"
  await foreign({ by: "window", act: "1", actions: [PLACE, RENAME], library: { pages: [], folders: ["b1"] } }, () => {
    there.actions.perform(
      PLACE,
      { item: "@matomezu/box:shape-nest-box", at: { x: 40, y: 40 }, props: { caption: "箱" } },
      { page },
    )
    there.actions.perform(RENAME, { entry: "b1", title: "混ぜた名前" })
  })
  const inBook = here.state.getState().history.b1?.undo ?? []
  expect(inBook).toHaveLength(1)
  expect(Object.keys(inBook[0]!.pages)).toEqual([page])
  expect(inBook[0]!.folders.b1).toBeUndefined()
  expect(libraryHistory(here).undo).toMatchObject([{ by: "window", pages: {}, folders: { b1: {} } }])
})

test("利用者の書庫の元に戻すが、まだ見ていない AI の値を上書きしたら、その変更は捨て、消えた所と値を知らせる", async () => {
  const { here, there, told, foreign, show } = pair()
  here.actions.perform(RENAME, { entry: "b1", title: "利用者の名前" })
  await settled()
  there.actions.perform(RENAME, { entry: "b1", title: "利用者の名前" })
  await settled()
  here.receive(rowsOf(there), [])
  await foreign({ by: "ai", act: "5", actions: [RENAME], library: { pages: [], folders: ["b1"] } }, () =>
    there.actions.perform(RENAME, { entry: "b1", title: "AI の名前" }),
  )
  expect(here.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(titleOf(here, "b1")).not.toBe("AI の名前")
  expect(told).toEqual([
    { book: "b1", act: "5", places: ["b1"], outcome: "lost", lost: [{ at: "title", value: "AI の名前" }] },
  ])
  show([HOME_ID])
  expect(libraryHistory(here).undo.filter(s => s.by === "ai")).toEqual([])
})

test("近くのフォルダ: 並びの変わったフォルダはそのフォルダ、名前の変わった物・足した物は入れ物のフォルダ（中身の変化は、入れ物の上のフォルダでは見えない）", async () => {
  const { there } = pair()
  const folders = () => there.state.getState().folders
  const made = there.actions.perform("@matomezu/base:folder-create", { title: "箱" })
  await settled()
  const box = (made as { result: { folder: string } }).result.folder
  const rowsBetween = (was: ReturnType<typeof folders>, now: ReturnType<typeof folders>) => ({
    pages: {},
    folders: Object.fromEntries(
      [...new Set([...Object.keys(was), ...Object.keys(now)])]
        .filter(id => was[id] !== now[id])
        .map(id => [id, { before: was[id] ?? ("none" as const), after: now[id] ?? ("none" as const) }]),
    ),
  })
  // ブックを箱へ動かす: 出た所（書庫ホーム）と入った所（箱）
  let was = folders()
  there.actions.perform("@matomezu/base:entry-move", { entry: "b1", into: box })
  await settled()
  expect(foldersNear(rowsBetween(was, folders()), was, folders()).sort()).toEqual([box, HOME_ID].sort())
  // 箱の中のブックの名前を変える: 箱だけ（書庫ホームでは見えない）
  was = folders()
  there.actions.perform(RENAME, { entry: "b1", title: "箱の中の名前" })
  await settled()
  expect(foldersNear(rowsBetween(was, folders()), was, folders())).toEqual([box])
  // 箱の名前を変える: 箱を入れている書庫ホーム
  was = folders()
  there.actions.perform(RENAME, { entry: box, title: "別の箱" })
  await settled()
  expect(foldersNear(rowsBetween(was, folders()), was, folders())).toEqual([HOME_ID])
})
