// 書庫の画面の、ブックの中身に並ぶ参照エントリの行: 指す先の名前とタイプで並び、開くとそのブックのその参照を開く。右クリックの「参照元へ移動」は指す先を開く。
// 選んでいても、エントリのコマンド（名前を変える・複製・動かす）は効かない。右クリックの「削除」と Delete キーは、確かめずに消す（書庫の Ctrl+Z で戻る）

import { expect, test } from "bun:test"
import type { CommandId } from "../../../web/src/core/catalog"
import { HOME_ID } from "../../../web/src/core/folders"
import { openedEntry, openedReference } from "../../../web/src/core/stage"
import { recentBookScreen, screenOf } from "../../../web/src/core/window"
import { LIBRARY_SCREEN } from "../../../web/src/plugins/base/library"
import {
  bookOpenedFrom,
  chosenBy,
  NOT_OPENED,
  openTargetOf,
  paneIdsOf,
  rowsIn,
} from "../../../web/src/plugins/base/library/outline"
import { LIBRARY_FOLDER, LIBRARY_PICKED } from "../../../web/src/plugins/base/library/state"
import { NO_DESKS } from "../../../web/src/plugins/base/library/workdesk-rows"
import { isShown } from "../../../web/src/store/commands"
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

const CHOOSING = "@matomezu/base:library-choosing"
const choosingAt = (store: ReturnType<typeof setup>["store"], screen: string) =>
  (store.state.getState().pluginValues.screens[screen] as Record<string, unknown> | undefined)?.[CHOOSING]

test("書庫の右クリックの「参照を置く…」で置くブックを選び始め、選べるブックに置くと、選ぶのをやめて書庫のままトーストで知らせる", () => {
  const { state, run, center, store, lineup } = setup()
  const page = lineup("b2")?.[0] as string
  run("library-reference-place", { entry: page })
  expect(choosingAt(store, center)).toEqual({ choose: "book", of: { kind: "page", id: page } })
  const of = { kind: "page" as const, id: page }
  const choosing = { choose: "book" as const, of }
  // 指す先の入っているブックは選べず、ほかのブックは選べる
  expect(chosenBy(state.getState().folders, choosing, "b2", NO_DESKS)).toBeUndefined()
  expect(chosenBy(state.getState().folders, choosing, "b1", NO_DESKS)).toEqual({ book: "b1", of })
  // 選べないブックを開いても、窓には開かず、中へも入らない（置くブックを選んでいる間は、ブックの中に選べる物が無い）
  const screens = state.getState().window.screens.length
  run("library-entry-open", { entry: "b2" })
  expect(state.getState().window.screens.length).toBe(screens)
  expect((state.getState().pluginValues.screens[center] as Record<string, unknown>)[LIBRARY_FOLDER.id]).toBeUndefined()
  // 選べるブックを開く（Enter・ダブルクリック）と置く
  run("library-entry-open", { entry: "b1" })
  expect(state.getState().window.screens.length).toBe(screens)
  expect(state.getState().folders.b1?.lineup.some(r => r.kind === "reference" && r.of.id === page)).toBe(true)
  expect(choosingAt(store, center)).toBeUndefined()
  expect(state.getState().toasts.at(-1)).toMatchObject({
    kind: "success",
    message: "@matomezu/base:Placed a reference in {book}",
  })
})

test("置く参照エントリを置くために選んでいる間の開く（Enter・ダブルクリック）: 選べるページは置き、フォルダとブックは中へ入り、選べないページは何もしない", () => {
  const { state, store, lineup, perform } = setup()
  const made = perform("@matomezu/base:folder-create", { title: "箱", into: HOME_ID })
  const box = (made.result as { folder: string }).folder
  expect(store.actions.showBook("b1")).toBe(true)
  const book = recentBookScreen(state.getState().window)
  const stage = book?.stages.current as string
  const command = store.actions.command as (at: string, id: string, ...args: unknown[]) => boolean
  expect(command(stage, "@matomezu/base:library-reference-choose")).toBe(true)
  const library = state.getState().window.screens.find(s => s.def === LIBRARY_SCREEN.id)?.id as string
  const open = (entry: string) => command(library, "@matomezu/base:library-entry-open", { entry })
  const folder = () => (state.getState().pluginValues.screens[library] as Record<string, unknown>)[LIBRARY_FOLDER.id]
  const screens = state.getState().window.screens.length
  open(box)
  expect(folder()).toBe(box)
  open("b2")
  expect(folder()).toBe("b2")
  open("p1") // 置くブック b1 の中のページ
  expect(folder()).toBe("b2")
  expect(choosingAt(store, library)).toEqual({ choose: "referred", book: "b1" })
  expect(state.getState().window.screens.length).toBe(screens)
  open(lineup("b2")?.[0] as string)
  expect(state.getState().folders.b1?.lineup.at(-1)).toMatchObject({ kind: "reference" })
})

test("選ぶ事が続けられなくなったら（置く先のブックをゴミ箱に入れた）、参照エントリを置くために選んでいない間と同じに開く", () => {
  const { state, run, center, store, perform } = setup()
  store.setPluginState(CHOOSING, center, { choose: "referred", book: "b1" })
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  const screens = state.getState().window.screens.length
  run("library-entry-open", { entry: "b2" })
  expect(state.getState().window.screens.length).toBeGreaterThan(screens)
})

test("参照エントリを置くために選んでいる間は、開く・分割で開く・参照元へ移動・参照を置く…・新しいブック…を出さず、［取消］でやめる。参照を置く…は参照エントリの行に出さない", () => {
  const { state, run, center, store, lineup, ref } = setup()
  const page = lineup("b2")?.[0] as string
  const shown = (id: string, menu: string, target: unknown) => {
    store.actions.openContextMenu(center, `@matomezu/base:${menu}`, target, { x: 0, y: 0 })
    return isShown(store, state.getState(), center, `@matomezu/base:${id}` as CommandId)
  }
  const rows = ["library-entry-open", "library-entry-open-split", "library-reference-place"]
  const menu = (entry: string) => rows.filter(id => shown(id, "library-entry-context", { entry }))
  expect(menu("p1")).toEqual(rows)
  expect(shown("library-reference-place", "library-entry-context", { entry: ref })).toBe(false)
  store.actions.closeContextMenu()
  const bookNew = () => isShown(store, state.getState(), center, "@matomezu/base:library-book-new" as CommandId)
  expect(bookNew()).toBe(true)
  run("library-reference-place", { entry: page })
  // 新しいブック…（書庫の画面のボタンと、右クリックのメニュー）も出さない
  expect(bookNew()).toBe(false)
  expect(menu("p1")).toEqual([])
  expect(shown("library-reference-source", "library-reference-context", { reference: ref })).toBe(false)
  store.actions.closeContextMenu()
  run("library-choose-cancel")
  expect(choosingAt(store, center)).toBeUndefined()
  expect(menu("p1")).toEqual(rows)
})

test("ページタブの＋の「参照…」で書庫を開いて置く参照を選び始め、選べるページを選んで置くと、書庫を閉じてブックの置いた参照エントリを開く。［取消］は書庫を閉じる", () => {
  const { state, store, lineup } = setup()
  const command = store.actions.command as (at: string, id: string, ...args: unknown[]) => boolean
  const libraryScreen = () => state.getState().window.screens.find(s => s.def === LIBRARY_SCREEN.id)?.id
  const bookStage = () => {
    const book = recentBookScreen(state.getState().window)
    return book?.stages.stages.find(s => s.id === book.stages.current)
  }
  expect(store.actions.showBook("b1")).toBe(true)
  const stage = bookStage()?.id as string
  // 取消: 書庫を閉じる
  expect(command(stage, "@matomezu/base:library-reference-choose")).toBe(true)
  const first = libraryScreen() as string
  expect(choosingAt(store, first)).toEqual({ choose: "referred", book: "b1" })
  expect(command(first, "@matomezu/base:library-choose-cancel")).toBe(true)
  expect(libraryScreen()).toBeUndefined()
  // 置く: b2 のページを選ぶ（b1 の中のページ・ブックは選べない）
  expect(command(stage, "@matomezu/base:library-reference-choose")).toBe(true)
  const library = libraryScreen() as string
  const folders = state.getState().folders
  const page = lineup("b2")?.[0] as string
  expect(chosenBy(folders, { choose: "referred", book: "b1" }, "p1", NO_DESKS)).toBeUndefined()
  expect(chosenBy(folders, { choose: "referred", book: "b1" }, "b2", NO_DESKS)).toBeUndefined()
  expect(command(library, "@matomezu/base:library-choose-place", { entry: page })).toBe(true)
  expect(libraryScreen()).toBeUndefined()
  const placed = state.getState().folders.b1?.lineup.at(-1)
  expect(placed).toMatchObject({ kind: "reference", of: { kind: "page", id: page } })
  expect(bookStage() && openedReference(bookStage()!.opened)).toMatchObject({ reference: placed?.id })
})
