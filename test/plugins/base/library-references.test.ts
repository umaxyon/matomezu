// 書庫の画面の、ブックの中身に並ぶ参照エントリの行: 指す先の名前とタイプで並び、開くとそのブックのその参照を開く。右クリックの「参照元へ移動」は指す先を開く。
// 選んでいても、エントリのコマンド（名前を変える・複製・動かす）は効かない。右クリックの「削除」と Delete キーは、確かめずに消す（書庫の Ctrl+Z で戻る）

import { expect, test } from "bun:test"
import { HOME_ID } from "../../../web/src/core/folders"
import { openedEntry, openedReference } from "../../../web/src/core/stage"
import { recentBookScreen, screenOf } from "../../../web/src/core/window"
import {
  bookOpenedFrom,
  NOT_OPENED,
  openTargetOf,
  paneIdsOf,
  rowsIn,
} from "../../../web/src/plugins/base/library/outline"
import { LIBRARY_FOLDER, LIBRARY_PICKED } from "../../../web/src/plugins/base/library/state"
import { NO_DESKS } from "../../../web/src/plugins/base/library/workdesk-rows"
import { NAMING, newStore } from "../../support"

function setup() {
  const store = newStore({ now: () => "2026-11-19T01:00:00.000Z" })
  const { state, actions } = store
  const perform = actions.perform as (id: string, args: unknown, on?: unknown) => { ok: boolean; result?: unknown }
  const added = perform("@matomezu/base:reference-add", { of: { kind: "page", id: "p1" }, index: 1 }, { book: "b2" })
  expect(added.ok).toBe(true)
  const ref = (added.result as { reference: string }).reference
  const center = state.getState().window.screens.find(s => s.stages === undefined)?.id as string
  actions.makeScreenCurrent(center)
  const run = (id: string, args?: unknown) =>
    (actions.command as (at: string, id: string, ...args: unknown[]) => boolean)(
      center,
      `@matomezu/base:${id}`,
      ...(args === undefined ? [] : [args]),
    )
  const lineup = (book: string) => state.getState().folders[book]?.lineup.map(r => r.id)
  return { store, state, perform, ref, center, run, lineup }
}

test("ブックの中身には、参照エントリも並びの所に、指す先の名前とタイプで並ぶ。ブックの中身でない所には出ない", () => {
  const { state, ref } = setup()
  const rows = rowsIn(state.getState(), "b2", NAMING, NO_DESKS)
  expect(rows.map(r => r.kind)).toEqual(["page", "reference"])
  expect(rows[1]).toMatchObject({ id: ref, title: "ページ 1", type: "@matomezu/drawing:drawing", readable: true })
  expect(paneIdsOf(state.getState().folders, [], "b2", NO_DESKS)).toEqual(rows.map(r => r.id))
  expect(rowsIn(state.getState(), HOME_ID, NAMING, NO_DESKS).some(r => r.kind === "reference")).toBe(false)
})

test("指す先がゴミ箱に入っても行は残り、名前はそのまま", () => {
  const { state, perform, ref } = setup()
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  expect(rowsIn(state.getState(), "b2", NAMING, NO_DESKS).find(r => r.id === ref)?.title).toBe("ページ 1")
})

test("参照エントリの行を開くと、そのブックのその参照エントリを開く。ブックがゴミ箱の中なら開かない", () => {
  const { state, perform, ref, run, center, store } = setup()
  const row = { id: ref, kind: "reference" as const, readable: true }
  expect(openTargetOf(state.getState().folders, row, NO_DESKS)).toEqual({ to: "book", book: "b2", reference: ref })
  store.setPluginState(LIBRARY_FOLDER.id, center, "b2")
  store.setPluginState(LIBRARY_PICKED.id, center, ref)
  run("library-entry-open")
  const stage = screenOf(state.getState().window).stages.find(s => openedEntry(s.opened)?.id === "b2")
  expect(stage && openedReference(stage.opened)).toMatchObject({ reference: ref })
  expect(perform("@matomezu/base:entry-trash", { entry: "b2" }).ok).toBe(true)
  expect(openTargetOf(state.getState().folders, row, NO_DESKS)).toBe(NOT_OPENED)
})

test("参照元へ移動は、指す先のページをそのブックで開く", () => {
  const { state, ref, run } = setup()
  run("library-reference-source", { reference: ref })
  const book = recentBookScreen(state.getState().window)
  const stage = book?.stages.stages.find(s => s.id === book.stages.current)
  expect(stage?.opened).toMatchObject({ kind: "page", page: "p1" })
  expect(openedEntry(stage!.opened)?.id).toBe("b1")
})

test("参照エントリの行を選んでいても、名前を変える・複製は何もしない", () => {
  const { state, ref, run, center, store, lineup } = setup()
  store.setPluginState(LIBRARY_FOLDER.id, center, "b2")
  store.setPluginState(LIBRARY_PICKED.id, center, ref)
  const before = lineup("b2")
  run("library-entry-rename")
  run("library-entry-duplicate")
  expect(state.getState().dialog).toBeNull()
  expect(lineup("b2")).toEqual(before)
})

test("右クリックの削除と Delete キーは、確かめずに参照エントリを消し（指す先はそのまま）、書庫の Ctrl+Z で戻る", () => {
  const { state, ref, run, center, store, lineup } = setup()
  const before = lineup("b2")
  run("library-reference-delete", { reference: ref })
  expect(state.getState().dialog).toBeNull()
  expect(lineup("b2")).not.toContain(ref)
  expect(lineup("b1")).toContain("p1")
  run("library-undo")
  expect(lineup("b2")).toEqual(before)
  // Delete キーのコマンド（選んでいる行が参照エントリなら、ゴミ箱に入れずに消す）
  store.setPluginState(LIBRARY_FOLDER.id, center, "b2")
  store.setPluginState(LIBRARY_PICKED.id, center, ref)
  run("library-entry-trash")
  expect(state.getState().dialog).toBeNull()
  expect(lineup("b2")).not.toContain(ref)
  expect(state.getState().folders.b2?.folderRole).toBe("book")
})

test("書庫から参照を置くアクションは、置けない物を断る", () => {
  const { perform, lineup } = setup()
  expect(perform("@matomezu/base:library-reference-add", { book: "b2", of: { kind: "page", id: "p1" } }).ok).toBe(false)
  expect(perform("@matomezu/base:library-reference-add", { book: "b1", of: { kind: "page", id: "p1" } }).ok).toBe(false)
  const added = perform("@matomezu/base:library-reference-add", {
    book: "b1",
    of: { kind: "page", id: lineup("b2")?.[0] as string },
  })
  expect(added.ok).toBe(true)
  expect(lineup("b1")).toContain((added.result as { reference: string }).reference)
})

test("参照エントリの行は、ページの行と同じくブックスクリーンに開く行で（吹き出し・分割で開く）、ブックを窓に出すと、その参照エントリを開く", () => {
  const { state, ref, store } = setup()
  const row = { id: ref, kind: "reference" as const, readable: true }
  expect(bookOpenedFrom(state.getState().folders, row, NO_DESKS)).toEqual({ book: "b2", page: ref })
  expect(store.actions.showBook("b2", ref)).toBe(true)
  const book = recentBookScreen(state.getState().window)
  const stage = book?.stages.stages.find(s => s.id === book.stages.current)
  expect(stage && openedReference(stage.opened)).toMatchObject({ reference: ref })
})
