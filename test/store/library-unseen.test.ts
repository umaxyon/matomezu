// まだ見ていない、AI とほかの窓の書庫の変更: 常駐の知らせ（receive の change）の library（書庫の画面の履歴に入るアクションが変えたページとフォルダの前と後）の分は、
// ブックの画面の履歴に入れず、まだ見ていない書庫の変更として溜める。変わったフォルダか、変わった物を入れているフォルダを、見えているスクリーンのビューが見せたら、
// 書庫の画面の履歴に時刻の位置で差し込む。置き直しが上書きした、まだ見ていない変更は捨てる

import { expect, test } from "bun:test"
import { HOME_ID, TRASH_ID } from "../../web/src/core/folders"
import { LIBRARY_HISTORY } from "../../web/src/core/history"
import { applyPatch, patchOf } from "../../web/src/core/patch"
import { shownScreens } from "../../web/src/core/window"
import type { AIEditTicketOutcome } from "../../web/src/store/store"
import { CORE_CATALOG, newStore, sequence } from "../support"

type Store = ReturnType<typeof newStore>
type Step = { run: () => void; library?: true }
const settled = () => Promise.resolve()
const rowsOf = (store: Store) => {
  const { pages, folders } = store.state.getState()
  return { pages: Object.values(pages), folders: Object.values(folders), settings: {} }
}
const libraryHistory = (store: Store) => store.state.getState().history[LIBRARY_HISTORY] ?? { undo: [], redo: [] }
const titleOf = (store: Store, id: string) => (store.state.getState().folders[id] as { title?: string }).title
const RENAME = "@matomezu/base:entry-rename"
// よそが、ブック b1 の名前を書庫のアクションで title に変える
const renamed = (there: Store, title: string): Step => ({
  run: () => void there.actions.perform(RENAME, { entry: "b1", title }),
  library: true,
})

// この窓 here と、よそ（AI かほかの窓の代わりに、同じ世界から始めて行う）there。told は、この窓が常駐に知らせた見えた・消えた
function pair(visible: () => boolean = () => true) {
  const told: AIEditTicketOutcome[] = []
  let at = 0
  const here = newStore({
    visible,
    newId: sequence(),
    now: () => `2026-11-18T01:00:${String(at++).padStart(2, "0")}.000Z`,
    aiEditTicket: c => told.push(c),
  })
  const there = newStore({ newId: sequence() })
  here.receive(rowsOf(here), [])
  // よそが steps を順に行い、その後の世界を、この窓に知らせる。library の印の付いた物が変えたページとフォルダの前と後を、知らせの library に載せる
  // （常駐のエンジンが、書庫の画面の履歴に入るアクションの分として知らせる物）
  const foreign = async (
    change: { by: "ai" | "window"; act: string; actions: readonly string[] },
    ...steps: Step[]
  ) => {
    const library: Record<"pages" | "folders", Record<string, { before: unknown; after: unknown }>> = {
      pages: {},
      folders: {},
    }
    for (const step of steps) {
      const was = there.state.getState()
      step.run()
      await settled()
      const now = there.state.getState()
      if (!step.library) continue
      for (const table of ["pages", "folders"] as const)
        for (const id of new Set([...Object.keys(was[table]), ...Object.keys(now[table])])) {
          if (was[table][id] === now[table][id]) continue
          // 同じ物を 2 度目に変えた分は、それまでの後の値に、今回の違いだけを当てる（常駐のエンジンと同じ。間のほかのアクションの分を入れない）
          const had = library[table][id]
          const made = had ? patchOf(was[table][id], now[table][id]) : undefined
          const after = had
            ? made
              ? applyPatch(had.after === "none" ? undefined : had.after, made)
              : had.after
            : now[table][id]
          library[table][id] = { before: had?.before ?? was[table][id] ?? "none", after: after ?? "none" }
        }
    }
    const some = Object.keys(library.pages).length + Object.keys(library.folders).length > 0
    here.receive(rowsOf(there), [], { books: ["b1"], ...change, ...(some ? { library } : {}) })
  }
  const show = (folders: readonly string[] | null) =>
    here.setShownFolders("view", shownScreens(CORE_CATALOG, here.state.getState().window)[0] as string, folders)
  return { here, there, told, foreign, show }
}

test("AI が書庫のアクションで変えたブックの名前は、ブックの画面の履歴に入らず、入れ物のフォルダを書庫の画面が見せたら、書庫の画面の履歴に入る", async () => {
  const { here, there, told, foreign, show } = pair()
  await foreign({ by: "ai", act: "1", actions: [RENAME] }, renamed(there, "AI の名前"))
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
  await foreign({ by: "window", act: "1", actions: [RENAME] }, renamed(there, "一回目"))
  expect(libraryHistory(here).undo).toMatchObject([{ by: "window" }])
  show(null)
  await foreign({ by: "window", act: "2", actions: [RENAME] }, renamed(there, "二回目"))
  expect(libraryHistory(here).undo).toHaveLength(1)
})

test("見えていないスクリーンのビューが見せているフォルダでは、見えたとしない", async () => {
  const { here, there, foreign } = pair()
  here.setShownFolders("view", "no-such-screen", [HOME_ID])
  await foreign({ by: "ai", act: "1", actions: [RENAME] }, renamed(there, "AI の名前"))
  expect(libraryHistory(here).undo).toEqual([])
})

test("ほかの窓のアクションバルクにブックの変更と書庫の変更が混ざっていたら、ブックの分はブックの画面の履歴に、書庫の分は書庫の画面の履歴に分かれる", async () => {
  const { here, there, foreign, show } = pair()
  show([HOME_ID])
  const page = Object.keys(there.state.getState().pages)[0] as string
  const PLACE = "@matomezu/paper:item-place"
  await foreign(
    { by: "window", act: "1", actions: [PLACE, RENAME] },
    {
      run: () =>
        void there.actions.perform(
          PLACE,
          { item: "@matomezu/box:shape-nest-box", at: { x: 40, y: 40 }, props: { caption: "箱" } },
          { page },
        ),
    },
    renamed(there, "混ぜた名前"),
  )
  const inBook = here.state.getState().history.b1?.undo ?? []
  expect(inBook).toHaveLength(1)
  expect(Object.keys(inBook[0]?.pages ?? {})).toEqual([page])
  expect(inBook[0]?.folders.b1).toBeUndefined()
  expect(libraryHistory(here).undo).toMatchObject([{ by: "window", pages: {}, folders: { b1: {} } }])
})

test("同じブックを、ブックが対象のアクションと書庫が対象のアクションの両方が変えたバルクでも、ページを足した分はブックの画面の履歴に、名前の分は書庫の画面の履歴に入る", async () => {
  const { here, there, foreign, show } = pair()
  show([HOME_ID])
  const ADD = "@matomezu/base:page-add"
  const pagesBefore = Object.keys(here.state.getState().pages)
  const was = titleOf(here, "b1")
  await foreign(
    { by: "window", act: "1", actions: [ADD, RENAME] },
    {
      run: () =>
        void there.actions.perform(ADD, { type: "@matomezu/drawing:drawing", title: "足したページ" }, { book: "b1" }),
    },
    renamed(there, "両方が変えた名前"),
  )
  const [added] = Object.keys(here.state.getState().pages).filter(id => !pagesBefore.includes(id))
  if (!added) throw new Error("no page added")
  // 足したページは、開いたら見えたことになり、ブックの画面の履歴に入る
  here.actions.openPage("s1", added)
  const inBook = here.state.getState().history.b1?.undo ?? []
  expect(inBook.map(s => Object.keys(s.pages))).toEqual([[added]])
  expect(libraryHistory(here).undo.map(s => Object.keys(s.pages))).toEqual([[]])
  // 書庫の元に戻すは名前だけを戻し、足したページは残る
  expect(here.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(titleOf(here, "b1")).toBe(was)
  expect(added in here.state.getState().pages).toBe(true)
  // ブックの元に戻すは、足したページを消す
  expect(here.actions.command("s1", "@matomezu/base:undo")).toBe(true)
  expect(added in here.state.getState().pages).toBe(false)
  expect(titleOf(here, "b1")).toBe(was)
})

test("利用者の書庫の元に戻すが、まだ見ていない AI の値を上書きしたら、その変更は捨て、消えた所と値を知らせる", async () => {
  const { here, there, told, foreign, show } = pair()
  here.actions.perform(RENAME, { entry: "b1", title: "利用者の名前" })
  await settled()
  there.actions.perform(RENAME, { entry: "b1", title: "利用者の名前" })
  await settled()
  here.receive(rowsOf(there), [])
  await foreign({ by: "ai", act: "5", actions: [RENAME] }, renamed(there, "AI の名前"))
  expect(here.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(titleOf(here, "b1")).not.toBe("AI の名前")
  expect(told).toEqual([
    { book: "b1", act: "5", places: ["b1"], outcome: "lost", lost: [{ at: "title", value: "AI の名前" }] },
  ])
  show([HOME_ID])
  expect(libraryHistory(here).undo.filter(s => s.by === "ai")).toEqual([])
})

test("書庫が対象・ブックが対象・書庫が対象の順に同じブックを変えたバルクでも、足したページは書庫の画面の履歴の段に入らない", async () => {
  const { here, there, foreign, show } = pair()
  show([HOME_ID])
  const ADD = "@matomezu/base:page-add"
  const pagesBefore = Object.keys(here.state.getState().pages)
  const was = titleOf(here, "b1")
  await foreign(
    { by: "window", act: "1", actions: [RENAME, ADD, RENAME] },
    renamed(there, "一回目"),
    {
      run: () =>
        void there.actions.perform(ADD, { type: "@matomezu/drawing:drawing", title: "足したページ" }, { book: "b1" }),
    },
    renamed(there, "二回目"),
  )
  const [added] = Object.keys(here.state.getState().pages).filter(id => !pagesBefore.includes(id))
  if (!added) throw new Error("no page added")
  expect(here.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(titleOf(here, "b1")).toBe(was)
  expect(added in here.state.getState().pages).toBe(true)
})

test("窓が見えていない間は、見せているフォルダの変更も入らず、見えたら入る", async () => {
  let visible = false
  const { here, there, foreign, show } = pair(() => visible)
  show([HOME_ID])
  await foreign({ by: "ai", act: "1", actions: [RENAME] }, renamed(there, "AI の名前"))
  expect(libraryHistory(here).undo).toEqual([])
  visible = true
  here.checkSeen()
  expect(libraryHistory(here).undo).toMatchObject([{ by: "ai" }])
})

test("見えた変更は、時刻の位置に入る（そのあとの利用者の段より前）", async () => {
  const { here, there, foreign, show } = pair()
  await foreign({ by: "window", act: "1", actions: [RENAME] }, renamed(there, "ほかの窓の名前"))
  here.actions.perform("@matomezu/base:folder-create", { title: "利用者のフォルダ" })
  await settled()
  show([HOME_ID])
  expect(libraryHistory(here).undo.map(s => s.by)).toEqual(["window", "user"])
})

test("AI の 1 回の変更が 2 冊のブックを変え、利用者の書庫の元に戻すがその両方を上書きしたら、ブックごとに、そのブックの分だけを知らせる", async () => {
  const { here, there, told, foreign } = pair()
  const both = (store: Store, title: string) => {
    store.actions.perform(RENAME, { entry: "b1", title: `${title} 1` })
    store.actions.perform(RENAME, { entry: "b2", title: `${title} 2` })
  }
  // 利用者が 2 冊の名前を 1 回の操作で変え（続けて行ったアクションは 1 段）、よそも同じ所まで進める
  both(here, "利用者の名前")
  await settled()
  both(there, "利用者の名前")
  await settled()
  here.receive(rowsOf(there), [])
  await foreign(
    { by: "ai", act: "7", actions: [RENAME, RENAME] },
    { run: () => both(there, "AI の名前"), library: true },
  )
  expect(libraryHistory(here).undo).toHaveLength(1)
  expect(here.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(told.filter(t => t.outcome === "lost").sort((a, b) => (a.book < b.book ? -1 : 1))).toEqual([
    { book: "b1", act: "7", places: ["b1"], outcome: "lost", lost: [{ at: "title", value: "AI の名前 1" }] },
    { book: "b2", act: "7", places: ["b2"], outcome: "lost", lost: [{ at: "title", value: "AI の名前 2" }] },
  ])
})
