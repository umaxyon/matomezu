// ロック: ロック中のブック・ページは利用者も AI も変えられない（認可ステップ lock が止める）。外せるのは利用者だけ

import { expect, test } from "bun:test"
import { type Actor, AI, USER } from "../../web/src/core/actor"
import { pagesOf } from "../../web/src/core/book"
import type { MessageKey } from "../../web/src/core/catalog"
import { changesOf } from "../../web/src/core/changes"
import { foldersOverIn, withChanges } from "../../web/src/core/folders"
import { type PerformedIn, performIn } from "../../web/src/core/perform"
import type { Book } from "../../web/src/core/schema/book"
import { screenOf } from "../../web/src/core/window"
import { refusalMessage } from "../../web/src/plugins/base"
import { LOCK } from "../../web/src/plugins/base/lock"
import { addPageIn } from "../../web/src/plugins/base/page-tabs/add-page"
import type { CommandId } from "../../web/src/store/commands"
import { isEnabled } from "../../web/src/store/commands"
import { DRAWING, drawingPage, testBinder, testBook } from "../lineup"
import { CORE_CATALOG, newStore } from "../support"

type Drawing = Book

test("ロック中のブックは変えられず（認可ステップ lock が止める）、外せば変えられる。locked は title の次に並ぶ", () => {
  const { state, actions } = newStore()
  const book = () => state.getState().books.b1 as Drawing
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  expect(Object.keys(book()).slice(0, 4)).toEqual(["id", "title", "locked", "lineup"])
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(false)
  expect(actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" })).toEqual({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
  })
  expect(actions.perform("@matomezu/base:book-unlock", {}, { book: "b1" }).ok).toBe(true)
  expect("locked" in book()).toBe(false)
  expect(actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" }).ok).toBe(true)
})

test("ロック中のページは変えられず消せない。ほかのページは変えられる", () => {
  const store = newStore()
  const { state, actions } = store
  const book = () => state.getState().books.b1 as Drawing
  addPageIn(store, "s1", { type: "@matomezu/drawing:drawing", title: "ページ 2" })
  const [first, second] = pagesOf(book()).map(p => p.id) as [string, string]
  expect(actions.perform("@matomezu/base:page-lock", {}, { page: first }).ok).toBe(true)
  expect(pagesOf(book())[0]?.locked).toBe(true)
  const denied = (done: unknown) =>
    expect(done).toEqual({ ok: false, reason: "denied", permission: "@matomezu/base:lock" })
  denied(actions.perform("@matomezu/base:page-update", { title: "x" }, { page: first }))
  denied(actions.perform("@matomezu/base:page-remove", { page: first }, { book: "b1" }))
  expect(actions.perform("@matomezu/base:page-update", { title: "y" }, { page: second }).ok).toBe(true)
  expect(actions.perform("@matomezu/base:page-unlock", {}, { page: first }).ok).toBe(true)
  expect(actions.perform("@matomezu/base:page-remove", { page: first }, { book: "b1" }).ok).toBe(true)
})

test("AI はロックを掛けられるが外せない（userOnly のアクションは断る）", () => {
  const { state } = newStore()
  const ctx = (actor: Actor = USER) => ({
    catalog: CORE_CATALOG,
    controlCenter: "@matomezu/control-center:control-center",
    lang: "en" as const,
    newId: () => "n",
    now: "2026-10-29T00:00:00.000Z",
    actor,
  })
  let world = {
    pages: state.getState().pages,
    folders: state.getState().folders,
    settings: state.getState().settings,
    annotations: {},
    participants: [],
    records: {},
    counters: {},
  }
  const run = (id: string, actor?: Actor): PerformedIn => {
    const done = performIn(world, id, {}, { book: "b1" }, ctx(actor))
    if (done.ok && done.changes) world = { ...world, ...withChanges(world, done.changes) }
    return done
  }
  expect(run("@matomezu/base:book-lock", AI).ok).toBe(true)
  expect(run("@matomezu/base:book-unlock", AI)).toEqual({ ok: false, reason: "not-allowed" })
  expect(run("@matomezu/base:book-unlock").ok).toBe(true)
})

test("変える所を言わないアクションは、行う前にはページのロックで止めず、行った後の変化で止める", () => {
  const page = drawingPage("p1", { title: "1", locked: true })
  const before = testBook("b1", "b", [page])
  const action = CORE_CATALOG.actions.get("@matomezu/base:page-update")!
  expect(LOCK.denies({ kind: "folder", action, folder: before, actor: USER })).toBe(false)
  expect(LOCK.denies({ kind: "page", action, page, folders: foldersOverIn(before, "p1"), actor: USER })).toBe(true)
  const after = { ...before, lineup: [{ ...page, title: "x" }] }
  expect(LOCK.keeps!({ kind: "folder", action, before, after, changes: changesOf(before, after), actor: USER })).toBe(
    false,
  )
  // ロックの印を外せるのは、利用者の、掛け外しのアクションだけ
  const unlocked = { ...before, lineup: [drawingPage("p1", { title: "1" })] }
  const unlock = CORE_CATALOG.actions.get("@matomezu/base:page-unlock")!
  const kept = (by: typeof action, actor: typeof USER | typeof AI) =>
    LOCK.keeps!({ kind: "folder", action: by, before, after: unlocked, changes: changesOf(before, unlocked), actor })
  expect(kept(unlock, USER)).toBe(true)
  expect(kept(unlock, AI)).toBe(false)
  expect(kept(action, USER)).toBe(false)
})

test("ページで問う問い: ロック中のページは、そのページのロックの掛け外しのほかを止める。ほかのページは止めない", () => {
  const page = drawingPage("p1", { locked: true })
  const book = testBook("b1", "b", [page, drawingPage("p2", { title: "2" })])
  const ask = (action: string, id: string) =>
    LOCK.denies({
      kind: "page",
      action: CORE_CATALOG.actions.get(action)!,
      page: pagesOf(book).find(p => p.id === id)!,
      folders: foldersOverIn(book, id),
      actor: USER,
    })
  expect(ask("@matomezu/paper:item-place", "p1")).toBe(true)
  expect(ask("@matomezu/base:page-unlock", "p1")).toBe(false)
  expect(ask("@matomezu/paper:item-place", "p2")).toBe(false)
  // アノテーションは図の中身ではないので、ロック中のページでも止めない
  expect(ask("@matomezu/base:note-add", "p1")).toBe(false)
})

test("ページで問う問い: ロック中のブックの中のページは、バインダの中でも、ページのロックの掛け外しも止める", () => {
  const book = testBook("b1", "b", [drawingPage("p1"), testBinder("f1", "束", DRAWING, drawingPage("s1"))], {
    locked: true,
  })
  const ask = (action: string, id: string) =>
    LOCK.denies({
      kind: "page",
      action: CORE_CATALOG.actions.get(action)!,
      page: pagesOf(book).find(p => p.id === id)!,
      folders: foldersOverIn(book, id),
      actor: USER,
    })
  expect(ask("@matomezu/paper:item-place", "p1")).toBe(true)
  expect(ask("@matomezu/paper:item-place", "s1")).toBe(true)
  expect(ask("@matomezu/base:page-lock", "s1")).toBe(true)
})

test("ロック中は、行うアクションをどれも認可ステップに止められるコマンドを押せない。設定のダイアログはロックを外すために押せる", () => {
  const store = newStore()
  const { state, actions } = store
  addPageIn(store, "s1", { type: "@matomezu/drawing:drawing", title: "ページ 2" })
  const enabled = (id: CommandId) => isEnabled(store, state.getState(), "s1", id)
  // 箱を置こうとしている（paper-place を出す）
  const placing = () => {
    if (!screenOf(state.getState().window).stages[0]!.placing) actions.togglePlacing("s1", "@matomezu/box:shape-box")
  }
  const first = pagesOf(state.getState().books.b1 as Drawing)[0]!.id
  actions.openPage("s1", first)
  expect(actions.perform("@matomezu/base:page-lock", {}, { page: first }).ok).toBe(true)
  // 開いているページのロック: そのページを変えるコマンドは押せず、ブック単位のコマンドは押せる
  placing()
  expect(enabled("@matomezu/paper:paper-place")).toBe(false)
  expect(enabled("@matomezu/base:page-new")).toBe(true)
  expect(enabled("@matomezu/base:page-settings")).toBe(true)
  actions.openPage("s1", pagesOf(state.getState().books.b1 as Drawing)[1]!.id)
  placing()
  expect(enabled("@matomezu/paper:paper-place")).toBe(true)
  // ブックのロック: ブック単位のコマンドも押せない。ブックの設定は押せる
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  expect(enabled("@matomezu/base:page-new")).toBe(false)
  expect(enabled("@matomezu/paper:paper-place")).toBe(false)
  expect(enabled("@matomezu/base:book-settings")).toBe(true)
  // 一覧のアクションは開いているブックのロックで止めない
  expect(enabled("@matomezu/base:book-new")).toBe(
    isEnabled(newStore(), newStore().state.getState(), "s1", "@matomezu/base:book-new"),
  )
})

test("断りの文言は、認可ステップが止めたならそのステップの名前、ほかの理由なら呼ぶ側の文言", () => {
  const { actions } = newStore()
  expect(actions.perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  const done = actions.perform("@matomezu/base:book-update", { title: "x" }, { book: "b1" })
  const fallback = "@matomezu/tree:Does not fit on the paper" as MessageKey
  expect(done.ok || refusalMessage(CORE_CATALOG, done, fallback)).toBe(LOCK.title)
  expect(refusalMessage(CORE_CATALOG, { reason: "refused" }, fallback)).toBe(fallback)
})
