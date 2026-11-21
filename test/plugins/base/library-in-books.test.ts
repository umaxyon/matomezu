// 書庫が対象のアクションで、ブックの中のページ・バインダを扱う: entry-move はブックの中で並べ替え、ブックからブックへ動かし（ブックの外へは出さない。
// スライドのページはバインダの外へ 1 枚ずつ出さない）、entry-rename は名前を変え、entry-duplicate は番号付きの名前ですぐ後ろに写し、page-create はブックにページを作る。
// ロックしたページは、エントリとしてほかのブックへ動かせるが、名前は変えられない。ロックしたブックの中は、出し入れも並べ替えもできない

import { expect, test } from "bun:test"
import { HOME_ID } from "../../../web/src/core/folders"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { PAGE_CREATE } from "../../../web/src/plugins/base/library/entry-duplicate"
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

test("entry-move: ブックの中の物はブックの外へ出さない。スライドのページはバインダの外へ出さず、ほかのバインダへは動かせる", () => {
  const { lineup, add, act } = setup()
  const folder = act("folder-create", { title: "仕事" })
  const into = (folder.ok && (folder.result as { folder: string }).folder) as string
  expect(act("entry-move", { entry: "p1", into }).ok).toBe(false)
  expect(act("entry-move", { entry: "p1", into: HOME_ID }).ok).toBe(false)
  const s = add("b1", { type: SLIDE, title: "1", into: { newBinder: "説明" } })
  const t = add("b2", { type: SLIDE, title: "2", into: { newBinder: "説明" } })
  expect(act("entry-move", { entry: s.page, into: "b1" }).ok).toBe(false)
  expect(act("entry-move", { entry: s.page, into: t.binder }).ok).toBe(true)
  expect(lineup(t.binder as string)).toEqual([t.page, s.page])
  // バインダはブックからブックへ（名前が重なれば番号を付けて）
  expect(act("entry-move", { entry: s.binder, into: "b2", onConflict: "number" }).ok).toBe(true)
  expect(lineup("b2")?.at(-1)).toBe(s.binder)
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
