// 書庫が対象のアクションで、ブックの中のページ・バインダを扱う: entry-move はブックの中で並べ替え、ブックからブックへ、ブックと書庫ホーム・フォルダの間で動かし
// （空のバインダはブックの外へ出さない。スライドのページをバインダの外へ出すと、そのページだけのバインダが出来る）、entry-rename は名前を変え、entry-duplicate は番号付きの名前ですぐ後ろに写し、
// page-create はブックにページを作る。ロックしたページは、エントリとしてほかのブックへ動かせるが、名前は変えられない。ロックしたブックの中は、出し入れも並べ替えもできない

import { expect, test } from "bun:test"
import { HOME_ID } from "../../../web/src/core/folders"
import { LIBRARY_HISTORY } from "../../../web/src/core/history"
import { shownPageId } from "../../../web/src/core/stage"
import { screenOf } from "../../../web/src/core/window"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { PAGE_CREATE } from "../../../web/src/plugins/base/library/entry-duplicate"
import { libraryRevertArgs } from "../../../web/src/plugins/base/library/revert"
import { SLIDE_PLACE } from "../../../web/src/plugins/items/slide/actions"
import { pluginKit } from "../../../web/src/store/kit"
import { definePlugin } from "../../../web/src/store/plugin"
import { createMatomezuInstance } from "../../../web/src/store/store"
import { SAMPLE_BOOKS } from "../../sample-books"
import { newStore, showFirstBook } from "../../support"

const DRAWING = "@matomezu/drawing:drawing"
const SLIDE = "@matomezu/slide-page:slide"
const taken = { ok: false, reason: "refused", kind: "title-taken" }
const locked = { ok: false, reason: "denied", permission: "@matomezu/base:lock" }

function setup() {
  const store = newStore({ now: () => "2026-11-19T01:00:00.000Z" })
  const { perform } = store.actions
  const state = () => store.state.getState()
  const lineup = (id: string) => state().folders[id]?.lineup.map(r => r.id)
  const title = (id: string) => (state().pages[id] ?? state().folders[id]) as { title?: string } | undefined
  const titleOf = (id: string) => title(id)?.title
  const add = (book: string, args: Record<string, unknown>) => {
    const done = perform("@matomezu/base:page-add", { type: DRAWING, ...args } as never, { book })
    if (!done.ok) throw new Error(JSON.stringify(done))
    return done.result as { page: string; binder?: string }
  }
  const act = (action: string, args: Record<string, unknown>) =>
    (perform as (id: string, args: unknown) => ReturnType<typeof perform>)(`@matomezu/base:${action}`, args)
  return { store, perform, state, lineup, titleOf, add, act }
}

// フォルダ「仕事」を書庫ホームに作った id
function folderIn(act: ReturnType<typeof setup>["act"]): string {
  const done = act("folder-create", { title: "仕事" })
  return (done.ok && (done.result as { folder: string }).folder) as string
}

test("entry-move: ブックの中で並べ替え、ほかのブックの並びの index 番目へ動かす。名前が重なれば断るか番号を付ける", () => {
  const { lineup, titleOf, add, act } = setup()
  const a = add("b1", { title: "A" }).page
  expect(act("entry-move", { entry: a, into: "b1", index: 0 }).ok).toBe(true)
  expect(lineup("b1")).toEqual([a, "p1"])
  expect(act("entry-move", { entry: a, into: "b2", index: 0 }).ok).toBe(true)
  expect(lineup("b1")).toEqual(["p1"])
  expect(lineup("b2")).toEqual([a, "b2-p1"])
  // b2 にも「ページ 1」が在る
  expect(act("entry-move", { entry: "p1", into: "b2" })).toMatchObject(taken)
  expect(act("entry-move", { entry: "p1", into: "b2", onConflict: "number" })).toMatchObject({
    ok: true,
    result: { title: "ページ 1 2" },
  })
  expect(titleOf("p1")).toBe("ページ 1 2")
})

test("entry-move: スライドのページをバインダでない所へ動かすと、作ったバインダの id と名前を result に返す。ほかのバインダへも動かせる", () => {
  const { lineup, titleOf, add, act } = setup()
  const into = folderIn(act)
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  const t = add("b2", { type: SLIDE, title: "2", into: { newBinder: "説明" } })
  const made = act("entry-move", { entry: s.page, into })
  const binder = (made.ok && (made.result as { binder: string }).binder) as string
  expect(made).toEqual({ ok: true, result: { binder, title: titleOf(binder) } })
  expect(lineup(into)).toEqual([binder])
  expect(lineup(binder)).toEqual([s.page])
  // ほかのバインダへ
  expect(act("entry-move", { entry: t.page, into: binder }).ok).toBe(true)
  expect(lineup(binder)).toEqual([s.page, t.page])
  // ブックの並びへ
  const inBook = act("entry-move", { entry: s.page, into: "b2" })
  expect(inBook.ok && lineup("b2")?.includes((inBook.result as { binder: string }).binder)).toBe(true)
  // バインダはブックからブックへ（名前が重なれば番号を付けて）
  expect(act("entry-move", { entry: s.binder, into: "b2", onConflict: "number" }).ok).toBe(true)
  expect(lineup("b2")?.at(-1)).toBe(s.binder)
})

test("entry-move: スライドで作るバインダの名前が重なれば、onConflict が refuse でも番号を付ける。ブックの外の 1 枚だけのバインダから出すときは、バインダごとの移動と同じに断るか番号を付ける", () => {
  const { titleOf, add, act } = setup()
  const into = folderIn(act)
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  add("b1", { type: SLIDE, title: "2", into: { binder: s.binder } })
  expect(act("folder-create", { title: "説明 - 1", into }).ok).toBe(true)
  const made = act("entry-move", { entry: s.page, into, onConflict: "refuse" })
  const binder = (made.ok && (made.result as { binder: string }).binder) as string
  expect(made).toEqual({ ok: true, result: { binder, title: "説明 - 1 2" } })
  // 外の 1 枚だけのバインダから: バインダを作らないので、result は空
  expect(act("entry-move", { entry: s.page, into: HOME_ID })).toEqual({ ok: true, result: {} })
  expect(act("folder-create", { title: "説明 - 1 2", into }).ok).toBe(true)
  expect(act("entry-move", { entry: s.page, into })).toMatchObject(taken)
  expect(act("entry-move", { entry: s.page, into, onConflict: "number" })).toEqual({
    ok: true,
    result: { title: "説明 - 1 2 2" },
  })
  expect(titleOf(binder)).toBe("説明 - 1 2 2")
  expect(titleOf(s.page)).toBe("1")
})

test("entry-move-over: スライドでバインダを作る移動は entry-move と同じ（消す物を名指せば断る）。ブックの外の 1 枚だけのバインダから出すときは、同じ名前のバインダを消してバインダごと動く", () => {
  const { state, lineup, titleOf, add, act } = setup()
  const into = folderIn(act)
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  const two = add("b1", { type: SLIDE, title: "2", into: { binder: s.binder } }).page
  const three = add("b1", { type: SLIDE, title: "3", into: { binder: s.binder } }).page
  const made = act("entry-move-over", { entry: s.page, into })
  expect(made).toMatchObject({ ok: true, result: { title: "説明 - 1" } })
  const first = (made.ok && (made.result as { binder: string }).binder) as string
  expect(act("entry-move-over", { entry: three, into, replaces: first })).toMatchObject({ ok: false })
  const home = act("entry-move", { entry: two, into: HOME_ID })
  const second = (home.ok && (home.result as { binder: string }).binder) as string
  expect(act("entry-rename", { entry: second, title: "説明 - 1" }).ok).toBe(true)
  expect(act("entry-move-over", { entry: two, into, replaces: first })).toEqual({ ok: true, result: {} })
  expect(lineup(into)).toEqual([second])
  expect(titleOf(second)).toBe("説明 - 1")
  expect(state().folders[first]).toBeUndefined()
  expect(state().pages[s.page]).toBeUndefined()
})

test("entry-move: スライドをバインダの外へ出しても、アノテーションは付いたまま。ロックしたブックからは出せない", () => {
  const { store, state, perform, add, act } = setup()
  const into = folderIn(act)
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  const placed = store.actions.perform(
    SLIDE_PLACE.id,
    { item: "@matomezu/slide:slide-text", at: { x: 40, y: 40 }, props: { text: "a" } },
    { page: s.page },
  )
  const item = (placed.ok && (placed.result as { item: string }).item) as string
  expect(store.actions.perform("@matomezu/base:note-add", { anchors: [item], text: "見て" }, { page: s.page }).ok).toBe(
    true,
  )
  const notes = state().annotations
  expect(act("entry-move", { entry: s.page, into }).ok).toBe(true)
  expect(state().annotations).toBe(notes)
  const t = add("b2", { type: SLIDE, title: "2", into: { newBinder: "束" } })
  expect(perform("@matomezu/base:book-lock", {}, { book: "b2" }).ok).toBe(true)
  expect(act("entry-move", { entry: t.page, into })).toMatchObject({ ...locked, book: "b2" })
  expect(state().folders[t.binder as string]?.lineup).toHaveLength(1)
})

test("entry-move: 開いているブックのスライドがバインダの外へ出ると、ステージはブックの元のバインダの隣のページを開く（中に残りのページが無ければ空のバインダ）", () => {
  const { store, state, add, act } = setup()
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  const t = add("b1", { type: SLIDE, title: "2", into: { binder: s.binder } }).page
  const into = folderIn(act)
  showFirstBook(store)
  store.actions.openPage("s1", s.page)
  const shown = () => screenOf(state().window).stages.map(st => shownPageId(st.opened ?? null))
  expect(shown()).toEqual([s.page])
  // バインダの中の隣のページを開く
  expect(act("entry-move", { entry: s.page, into }).ok).toBe(true)
  expect(shown()).toEqual([t])
  // バインダの中の残りのページが無いので、ブックに残った空のバインダを開く
  expect(act("entry-move", { entry: t, into }).ok).toBe(true)
  expect(shown()).toEqual([null])
  expect(screenOf(state().window).stages[0]?.opened).toMatchObject({ kind: "binder", binder: s.binder })
})

test("entry-move: ブックのページをフォルダ・書庫ホームへ出し、ブックの外のページをブックへ入れる。アノテーションは付いたまま。ブックは空になってよい", () => {
  const { store, state, lineup, act } = setup()
  const into = folderIn(act)
  const placed = store.actions.perform(
    "@matomezu/paper:item-place",
    { item: "@matomezu/box:shape-nest-box", at: { x: 40, y: 40 } },
    { page: "p1" },
  )
  const item = (placed.ok && (placed.result as { item: string }).item) as string
  expect(store.actions.perform("@matomezu/base:note-add", { anchors: [item], text: "見て" }, { page: "p1" }).ok).toBe(
    true,
  )
  const notes = state().annotations
  expect(act("entry-move", { entry: "p1", into }).ok).toBe(true)
  expect(lineup("b1")).toEqual([])
  expect(lineup(into)).toEqual(["p1"])
  expect(state().annotations).toBe(notes)
  expect(act("entry-move", { entry: "p1", into: HOME_ID, index: 0 }).ok).toBe(true)
  expect(lineup(HOME_ID)?.[0]).toBe("p1")
  expect(act("entry-move", { entry: "p1", into: "b1" }).ok).toBe(true)
  expect(lineup("b1")).toEqual(["p1"])
  expect(lineup(HOME_ID)).not.toContain("p1")
  expect(state().annotations).toBe(notes)
})

test("entry-move: 開いているブックのページがフォルダへ出ると、ステージはブックの隣のページを開く", () => {
  const { store, state, add, act } = setup()
  const a = add("b1", { title: "A" }).page
  showFirstBook(store)
  const shown = () => screenOf(state().window).stages.map(s => shownPageId(s.opened ?? null))
  expect(shown()).toEqual(["p1"])
  expect(act("entry-move", { entry: "p1", into: folderIn(act) }).ok).toBe(true)
  expect(shown()).toEqual([a])
})

test("entry-move: バインダごとブックからフォルダへ出し、ブックへ入れる。空のバインダはブックの外へ出さない", () => {
  const { state, lineup, add, act } = setup()
  const into = folderIn(act)
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  const binder = s.binder as string
  expect(act("entry-move", { entry: binder, into }).ok).toBe(true)
  expect(lineup(into)).toEqual([binder])
  expect(lineup(binder)).toEqual([s.page])
  expect(act("entry-move", { entry: binder, into: "b2" }).ok).toBe(true)
  expect(lineup("b2")).toEqual(["b2-p1", binder])
  // 中を空にしたバインダは、ブックの中には在れるが、外へは出せない
  const t = add("b1", { type: SLIDE, title: "2", into: { newBinder: "別" } })
  expect(act("entry-move", { entry: s.page, into: t.binder }).ok).toBe(true)
  expect(lineup(binder)).toEqual([])
  expect(act("entry-move", { entry: binder, into }).ok).toBe(false)
  expect(act("entry-move", { entry: binder, into: HOME_ID }).ok).toBe(false)
  expect(state().folders[binder]).toBeDefined()
})

test("entry-move: ブックとフォルダの間で名前が重なれば断る（title-taken）か、onConflict number で番号を付ける", () => {
  const { lineup, titleOf, act } = setup()
  const into = folderIn(act)
  expect(act("entry-move", { entry: "p1", into }).ok).toBe(true)
  // b2 にも「ページ 1」が在る
  expect(act("entry-move", { entry: "b2-p1", into })).toMatchObject(taken)
  expect(act("entry-move", { entry: "b2-p1", into, onConflict: "number" })).toMatchObject({
    ok: true,
    result: { title: "ページ 1 2" },
  })
  expect(lineup(into)).toEqual(["p1", "b2-p1"])
  expect(titleOf("b2-p1")).toBe("ページ 1 2")
  expect(act("entry-move", { entry: "p1", into: "b2" }).ok).toBe(true)
  expect(act("entry-move", { entry: "b2-p1", into: "b2" }).ok).toBe(true)
  expect(lineup("b2")).toEqual(["p1", "b2-p1"])
})

test("entry-move: ブックとフォルダの間の移動は、書庫の元に戻す（library-revert）で戻る", async () => {
  const { store, state, lineup, act } = setup()
  const into = folderIn(act)
  const undo = () => {
    const step = (state().history[LIBRARY_HISTORY] ?? { undo: [] }).undo.at(-1)
    const done = step ? store.actions.perform("@matomezu/base:library-revert", libraryRevertArgs(step, "before")) : null
    if (done?.ok) store.actions.moveHistory(LIBRARY_HISTORY, "undo")
    return done?.ok
  }
  await Promise.resolve()
  expect(act("entry-move", { entry: "p1", into }).ok).toBe(true)
  await Promise.resolve()
  expect(undo()).toBe(true)
  expect(lineup("b1")).toEqual(["p1"])
  expect(lineup(into)).toEqual([])
})

test("entry-move: スライドでバインダを作る移動・ブックの外のバインダが空になって消える移動は、書庫の元に戻す（library-revert）で戻る", async () => {
  const { store, state, lineup, add, act } = setup()
  const into = folderIn(act)
  const undo = () => {
    const step = (state().history[LIBRARY_HISTORY] ?? { undo: [] }).undo.at(-1)
    const done = step ? store.actions.perform("@matomezu/base:library-revert", libraryRevertArgs(step, "before")) : null
    if (done?.ok) store.actions.moveHistory(LIBRARY_HISTORY, "undo")
    return done?.ok
  }
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  const t = add("b2", { type: SLIDE, title: "2", into: { newBinder: "束" } })
  await Promise.resolve()
  const made = act("entry-move", { entry: s.page, into })
  const binder = (made.ok && (made.result as { binder: string }).binder) as string
  await Promise.resolve()
  expect(undo()).toBe(true)
  expect(state().folders[binder]).toBeUndefined()
  expect(lineup(into)).toEqual([])
  expect(lineup(s.binder as string)).toEqual([s.page])
  // 外へ出したバインダから、ほかのバインダへ移して空にすると消え、戻すとバインダもページも戻る
  expect(act("entry-move", { entry: s.binder, into }).ok).toBe(true)
  await Promise.resolve()
  expect(act("entry-move", { entry: s.page, into: t.binder }).ok).toBe(true)
  expect(state().folders[s.binder as string]).toBeUndefined()
  expect(lineup(into)).toEqual([])
  await Promise.resolve()
  expect(undo()).toBe(true)
  expect(lineup(into)).toEqual([s.binder as string])
  expect(lineup(s.binder as string)).toEqual([s.page])
  expect(lineup(t.binder as string)).toEqual([t.page])
})

test("entry-rename: ブックの中のページ・バインダの名前を変える。同じブックの中の名前と重なれば断る", () => {
  const { titleOf, add, act } = setup()
  const a = add("b1", { title: "A" }).page
  expect(act("entry-rename", { entry: a, title: "あ" }).ok).toBe(true)
  expect(titleOf(a)).toBe("あ")
  expect(act("entry-rename", { entry: a, title: "ページ 1" }).ok).toBe(false)
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  expect(act("entry-rename", { entry: s.binder, title: "説明 改" }).ok).toBe(true)
  expect(titleOf(s.binder as string)).toBe("説明 改")
})

test("entry-duplicate: ページ・バインダを、番号付きの名前ですぐ後ろに写す。ブックとフォルダは写さない", () => {
  const { lineup, titleOf, add, act } = setup()
  add("b1", { title: "A" })
  const done = act("entry-duplicate", { entry: "p1" })
  expect(done.ok).toBe(true)
  const copy = (done.ok && (done.result as { entry: string }).entry) as string
  expect(lineup("b1")?.[1]).toBe(copy)
  expect(titleOf(copy)).toBe("ページ 1 2")
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  const binder = act("entry-duplicate", { entry: s.binder })
  const made = (binder.ok && (binder.result as { entry: string }).entry) as string
  expect(titleOf(made)).toBe("説明 2")
  expect(lineup(made)).toHaveLength(1)
  expect(act("entry-duplicate", { entry: "b1" }).ok).toBe(false)
})

test("page-create: ブックにページを作る（page-add と同じ引数）。ブックでないフォルダには作らない", () => {
  const { perform, lineup, titleOf, act } = setup()
  const done = perform(PAGE_CREATE.id, { folder: "b2", type: DRAWING, title: "新" })
  expect(done.ok).toBe(true)
  const page = (done.ok && (done.result as { page: string }).page) as string
  expect(lineup("b2")).toEqual(["b2-p1", page])
  expect(titleOf(page)).toBe("新")
  expect(act("page-create", { folder: HOME_ID, type: DRAWING }).ok).toBe(false)
  expect(act("page-create", { folder: "b2", type: DRAWING, title: "新" }).ok).toBe(false)
})

test("ロックしたページは、エントリとしてほかのブックへ動かせ、写せる。名前は変えられない", () => {
  const { perform, lineup, add, act } = setup()
  const a = add("b1", { title: "A" }).page
  expect(perform("@matomezu/base:page-lock", {}, { page: a }).ok).toBe(true)
  expect(act("entry-rename", { entry: a, title: "あ" })).toMatchObject(locked)
  expect(act("entry-duplicate", { entry: a }).ok).toBe(true)
  expect(act("entry-move", { entry: a, into: "b2" }).ok).toBe(true)
  expect(lineup("b2")).toEqual(["b2-p1", a])
})

test("ロックしたブックからは出さず、入れず、中を並べ替えず、ページを作らない（行う前に断る）", () => {
  const { perform, add, act } = setup()
  const a = add("b1", { title: "A" }).page
  expect(perform("@matomezu/base:book-lock", {}, { book: "b2" }).ok).toBe(true)
  expect(act("entry-move", { entry: a, into: "b2" })).toMatchObject({ ...locked, book: "b2" })
  expect(act("entry-move", { entry: "b2-p1", into: "b1" })).toMatchObject({ ...locked, book: "b2" })
  // ロックしたブックとフォルダの間も
  const into = folderIn(act)
  expect(act("entry-move", { entry: "b2-p1", into })).toMatchObject({ ...locked, book: "b2" })
  expect(act("entry-move", { entry: a, into }).ok).toBe(true)
  expect(act("entry-move", { entry: a, into: "b2" })).toMatchObject({ ...locked, book: "b2" })
  expect(act("page-create", { folder: "b2", type: DRAWING, title: "新" })).toMatchObject(locked)
  expect(perform("@matomezu/base:book-lock", {}, { book: "b1" }).ok).toBe(true)
  expect(act("entry-move", { entry: a, into: "b1", index: 0 })).toMatchObject({ ...locked, book: "b1" })
})

// 見本のタイプ: page-duplicate を外すタイプ（複製は宣言する）と、page-add を外すタイプ
const notes = pluginKit("notes", { Note: { en: "Note" } })
const NOTE_TYPE = {
  version: 1,
  title: "Note",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "portrait" },
  items: { allowed: [] },
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper",
  tokens: [],
  duplicatesPages: true,
} as const
const NOTES = definePlugin(
  notes.plugin({
    pageTypes: [
      notes.definePageType({ ...NOTE_TYPE, id: "kept", actions: { without: ["@matomezu/base:page-duplicate"] } }),
      notes.definePageType({ ...NOTE_TYPE, id: "fixed", actions: { without: ["@matomezu/base:page-add"] } }),
    ],
  }),
)

test("entry-duplicate・page-create は、ページのタイプが page-duplicate・page-add を外していれば、そのタイプで断る", () => {
  const store = createMatomezuInstance({
    plugins: [...BUILTIN, NOTES],
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
  })
  showFirstBook(store)
  const act = (action: string, args: Record<string, unknown>) =>
    (store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown; reason?: string })(
      `@matomezu/base:${action}`,
      args,
    )
  const made = act("page-create", { folder: "b1", type: "notes:kept", title: "残す" })
  expect(made.ok).toBe(true)
  const page = (made.result as { page: string }).page
  expect(store.actions.perform("@matomezu/base:page-duplicate", { page } as never, { book: "b1" })).toMatchObject({
    ok: false,
    reason: "not-allowed",
  })
  expect(act("entry-duplicate", { entry: page })).toMatchObject({ ok: false, reason: "refused" })
  expect(act("entry-duplicate", { entry: "p1" }).ok).toBe(true)
  expect(act("page-create", { folder: "b1", type: "notes:fixed", title: "作らない" })).toMatchObject({
    ok: false,
    reason: "refused",
  })
})
