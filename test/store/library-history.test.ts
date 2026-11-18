// 書庫の画面の履歴: 書庫が対象のアクション（フォルダを作る・動かす・名前を変える・ゴミ箱に入れる・戻す・ブックを作る）は、ブックの履歴とは別の、書庫の画面の履歴の段に入る。
// library-revert は、その段を前へ戻し、後へやり直す。消す・空にするは入らない。戻すと決まりを破るなら断る

import { expect, test } from "bun:test"
import { HOME_ID, TRASH_ID } from "../../web/src/core/folders"
import { LIBRARY_HISTORY } from "../../web/src/core/history"
import { libraryRevertArgs } from "../../web/src/plugins/base/library/revert"
import { newStore } from "../support"

const settled = () => Promise.resolve()

function setup() {
  const store = newStore({ now: () => "2026-11-18T01:00:00.000Z" })
  const { perform } = store.actions
  const history = () => store.state.getState().history[LIBRARY_HISTORY] ?? { undo: [], redo: [] }
  const lineup = (id: string) => store.state.getState().folders[id]?.lineup.map(r => r.id)
  const title = (id: string) => (store.state.getState().folders[id] as { title?: string } | undefined)?.title
  const move = (from: "undo" | "redo") => {
    const step = history()[from].at(-1)
    if (!step) return { ok: false as const }
    const done = perform("@matomezu/base:library-revert", libraryRevertArgs(step, from === "undo" ? "before" : "after"))
    if (done.ok) store.actions.moveHistory(LIBRARY_HISTORY, from)
    return done
  }
  const made = async (action: "folder-create" | "book-create", args: { title: string; into?: string }) => {
    const done = perform(`@matomezu/base:${action}`, args)
    if (!done.ok) throw new Error(JSON.stringify(done))
    await settled()
    const result = done.result as { folder?: string; book?: string }
    return (result.folder ?? result.book) as string
  }
  return { store, perform, history, lineup, title, move, made }
}

test("フォルダを作る・動かす・名前を変えるは、書庫の画面の履歴に 1 段ずつ入り、ブックの履歴には入らない。戻すと前の形に、やり直すと後の形になる", async () => {
  const { store, perform, history, lineup, title, move, made } = setup()
  const home = lineup(HOME_ID)
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-move", { entry: "b1", into: a })
  await settled()
  perform("@matomezu/base:entry-rename", { entry: a, title: "しごと" })
  await settled()
  expect(history().undo).toHaveLength(3)
  expect(store.state.getState().history.b1).toBeUndefined()
  expect(move("undo").ok).toBe(true)
  expect(title(a)).toBe("仕事")
  expect(move("undo").ok).toBe(true)
  expect(lineup(a)).toEqual([])
  expect(lineup(HOME_ID)).toContain("b1")
  expect(move("undo").ok).toBe(true)
  expect(a in store.state.getState().folders).toBe(false)
  expect(lineup(HOME_ID)).toEqual(home)
  expect(history()).toMatchObject({ undo: [], redo: [{}, {}, {}] })
  for (let i = 0; i < 3; i++) expect(move("redo").ok).toBe(true)
  expect(title(a)).toBe("しごと")
  expect(lineup(a)).toEqual(["b1"])
})

test("ゴミ箱に入れる・戻すも戻せる。ブックを作ったのを戻すと、ブックは無くなる", async () => {
  const { store, perform, lineup, move, made } = setup()
  const a = await made("folder-create", { title: "仕事" })
  const book = await made("book-create", { title: "議事録", into: a })
  perform("@matomezu/base:entry-trash", { entry: a })
  await settled()
  expect(book in store.state.getState().trash).toBe(true)
  expect(move("undo").ok).toBe(true)
  expect(lineup(TRASH_ID) ?? []).toEqual([])
  expect(lineup(a)).toEqual([book])
  expect(book in store.state.getState().books).toBe(true)
  expect(move("undo").ok).toBe(true)
  expect(book in store.state.getState().books || book in store.state.getState().trash).toBe(false)
  expect(lineup(a)).toEqual([])
  expect(move("redo").ok).toBe(true)
  expect(store.state.getState().books[book]?.title).toBe("議事録")
})

test("完全に消す・ゴミ箱を空にするは、書庫の画面の履歴に入らない", async () => {
  const { perform, history, made } = setup()
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-trash", { entry: a })
  await settled()
  const steps = history().undo.length
  perform("@matomezu/base:entry-purge", { entries: [a] })
  await settled()
  expect(history().undo).toHaveLength(steps)
})

test("名前を戻すと同じ名前が重なるなら、断る（title-taken）。段は動かない", async () => {
  const { perform, history, title, move, made } = setup()
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-rename", { entry: a, title: "しごと" })
  await settled()
  await made("folder-create", { title: "仕事" })
  const steps = history().undo.length
  const step = history().undo.at(-2)!
  const done = perform("@matomezu/base:library-revert", libraryRevertArgs(step, "before"))
  expect(done).toMatchObject({ ok: false, reason: "refused", kind: "title-taken" })
  expect(title(a)).toBe("しごと")
  expect(history().undo).toHaveLength(steps)
  expect(move("undo").ok).toBe(true)
})

test("ブックが対象のアクションと同じ処理の中で行っても、書庫の分は書庫の画面の履歴に、ブックの分はブックの履歴に分かれる", async () => {
  const { store, perform, history } = setup()
  perform("@matomezu/base:folder-create", { title: "仕事" })
  perform("@matomezu/base:book-update", { title: "改名" }, { book: "b1" })
  await settled()
  expect(history().undo).toHaveLength(1)
  expect(Object.keys(history().undo[0]!.folders)).not.toContain("b1")
  const inBook = store.state.getState().history.b1
  expect(inBook?.undo).toHaveLength(1)
  expect(inBook?.undo[0]?.books).toEqual(["b1"])
  expect(Object.keys(inBook!.undo[0]!.folders)).toEqual(["b1"])
})
