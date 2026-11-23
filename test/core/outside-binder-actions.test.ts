// ブックが対象のアクションは、ブックの外のバインダにも行える（宛先は on の book に、バインダの id）。
// 同じ中身のバインダをブックの中と外に置き、行った後のバインダと、行う前の問いの答えが同じになることを確かめる
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import { readLibrary, unreadableUnitsOf } from "../../web/src/core/book"
import { defineAction, NO_CONTROL_CENTER, type Where } from "../../web/src/core/def/action"
import { HOME_ID, type Library, TRASH_ID } from "../../web/src/core/folders"
import { bookOf, withBinderEntry } from "../../web/src/core/folders-books"
import { withChanges } from "../../web/src/core/folders-changes"
import { outsideAsked, outsideBinderIn } from "../../web/src/core/folders-tree"
import { openedAnswer } from "../../web/src/core/perform-permit"
import { performIn, permittedIn, type World } from "../../web/src/core/perform-world"
import type { AnyPage, BinderEntry } from "../../web/src/core/schema/book"
import { SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, libraryWith, sequence } from "../support"

const base = (id: string) => `@matomezu/base:${id}`
const slide = (id: string, title: string, rest: object = {}) => testPage(SLIDE, id, { title, ...rest }) as AnyPage

const ctxOf = (catalog = CORE_CATALOG) =>
  ({
    catalog,
    controlCenter: NO_CONTROL_CENTER,
    lang: "en" as const,
    newId: sequence(),
    now: "2026-01-01T00:00:00.000Z",
    today: "2026-01-01",
    actor: USER,
  }) as unknown as Parameters<typeof performIn>[4]

const worldOf = (library: Library, annotations: World["annotations"] = {}): World => ({
  ...library,
  settings: {},
  annotations,
  records: {},
  counters: {},
})

// バインダ n1（中は pages）を、ブック b1 の中に置いた世界と、書庫ホームの直下（ブックの外）に置いた世界
function both(pages: AnyPage[] = [slide("s1", "1"), slide("s2", "2"), slide("s3", "3")]) {
  const binder = testBinder("n1", "束", SLIDE, ...pages)
  return {
    inside: worldOf(libraryWith([testBook("b1", "ブック", [binder])])),
    outside: worldOf(libraryWith([], [binder])),
  }
}

// 行った後のバインダ n1 の、中のページの id と名前（行えなければ、その断り）
function binderAfter(world: World, on: string, id: string, args: unknown) {
  const done = performIn(world, id, args, { book: on }, ctxOf())
  if (!done.ok) return done
  const after = withChanges(world, done.changes ?? { pages: {}, folders: {} })
  const binder = on === "n1" ? outsideBinderIn(after, "n1") : bookOf(after, on)?.lineup.find(e => e.id === "n1")
  return {
    result: done.result,
    pages: (binder as BinderEntry).lineup.map(p => [p.id, p.title, p.paper, p.orientation]),
  }
}

const ACTIONS: [string, unknown][] = [
  [base("page-add"), { type: SLIDE, into: { binder: "n1" } }],
  [base("page-add"), { type: SLIDE, into: { binder: "n1" }, index: 1, title: "間" }],
  [base("page-duplicate"), { page: "s2" }],
  [base("page-move"), { page: "s1", index: 2 }],
  [base("page-remove"), { page: "s2" }],
  [base("binder-update"), { binder: "n1", orientation: "portrait" }],
  [base("pages-update"), { pages: "all", settings: {} }],
]

test("ブックの中のバインダと外のバインダで、行った後のバインダの中が同じ", () => {
  for (const [id, args] of ACTIONS) {
    const { inside, outside } = both()
    const within = binderAfter(inside, "b1", id, args)
    expect([id, binderAfter(outside, "n1", id, args)]).toEqual([id, within])
  }
})

test("行う前の問いは、行った答えと同じで、ロックしたページの扱いはブックの中と同じ（紙と向きをまとめて変えるのだけは、外では行う前に止める）", () => {
  const LOCK = base("lock")
  const pages = () => [slide("s1", "1"), slide("s2", "2", { locked: true }), slide("s3", "3")]
  const asked = (world: World, on: string, id: string, args: unknown) => {
    const before = permittedIn(world, id, args, { book: on }, ctxOf())
    const done = performIn(world, id, args, { book: on }, ctxOf())
    return { before: before.ok ? "ok" : before, done: done.ok ? "ok" : done }
  }
  const rows: [string, unknown][] = [
    [base("page-move"), { page: "s2", index: 0 }],
    [base("page-duplicate"), { page: "s2" }],
    [base("page-remove"), { page: "s2" }],
    [base("page-remove"), { page: "s1" }],
    [base("page-add"), { type: SLIDE, into: { binder: "n1" } }],
  ]
  for (const [id, args] of rows) {
    const { inside, outside } = both(pages())
    const within = asked(inside, "b1", id, args)
    const out = asked(outside, "n1", id, args)
    // 止めたページの id（page）は、外のバインダの答えだけが持つ
    const plain = (a: unknown) => (typeof a === "object" && a !== null ? { ...a, page: undefined } : a)
    expect([id, plain(out.before), plain(out.done)]).toEqual([id, plain(within.before), plain(within.done)])
    expect([id, out.before === "ok"]).toEqual([id, out.done === "ok"])
  }
  const { inside, outside } = both(pages())
  const paper = { binder: "n1", orientation: "portrait" }
  expect(asked(inside, "b1", base("binder-update"), paper)).toEqual({
    before: "ok",
    done: { ok: false, reason: "denied", permission: LOCK },
  })
  const denied = { ok: false, reason: "denied", permission: LOCK, page: "s2" }
  expect(asked(outside, "n1", base("binder-update"), paper)).toMatchObject({ before: denied, done: denied })
})

test("ロックしたページは、まとめて変えるときに飛ばす（ブックの中と同じ）", () => {
  const pages = [slide("s1", "1"), slide("s2", "2", { locked: true })]
  const type = CORE_CATALOG.pageTypes.get(SLIDE)
  const setting = [...CORE_CATALOG.settings.values()].find(
    s => s.holder === "page" && type?.settings?.includes(s.id as never) && s.id.endsWith(":theme"),
  )
  if (!setting) return
  const { inside, outside } = both(pages)
  const args = { pages: "all", settings: { [setting.id]: null } }
  const within = performIn(inside, base("pages-update"), args, { book: "b1" }, ctxOf())
  const out = performIn(outside, base("pages-update"), args, { book: "n1" }, ctxOf())
  expect(out.ok ? out.result : out).toEqual(within.ok ? within.result : within)
})

test("並びに同じバインダ 1 つだけを返さない物と、バインダの名前を変える物は断る", () => {
  const refused = { ok: false, reason: "refused" } as never
  const rows: [string, unknown][] = [
    [base("binder-remove"), { binder: "n1" }],
    [base("binder-duplicate"), { binder: "n1" }],
    [base("page-add"), { type: SLIDE, into: { newBinder: "別" } }],
    [base("binder-update"), { binder: "n1", title: "別の名前" }],
  ]
  for (const [id, args] of rows) {
    const { outside } = both()
    expect([id, performIn(outside, id, args, { book: "n1" }, ctxOf())]).toEqual([id, refused])
  }
})

test("最後の 1 枚は消せない（ブックの外のバインダは空にならない）", () => {
  const { outside } = both([slide("s1", "1")])
  expect(performIn(outside, base("page-remove"), { page: "s1" }, { book: "n1" }, ctxOf())).toEqual({
    ok: false,
    reason: "refused",
  })
})

test("ブックにだけ行えるアクション・ゴミ箱の中のバインダ・ブックの中のバインダの id は no-book", () => {
  const noBook = { ok: false, reason: "no-book" } as never
  const { inside, outside } = both()
  const ask = (world: World, id: string, args: unknown) => [
    performIn(world, id, args, { book: "n1" }, ctxOf()),
    permittedIn(world, id, args, { book: "n1" }, ctxOf()),
  ]
  expect(ask(outside, base("book-update"), { title: "名前" })).toEqual([noBook, noBook])
  expect(ask(outside, base("book-lock"), {})).toEqual([noBook, noBook])
  expect(ask(inside, base("page-remove"), { page: "s1" })).toEqual([noBook, noBook])
  const home = outside.folders[HOME_ID]
  const trash = outside.folders[TRASH_ID] ?? { folderRole: "trash" as const, id: TRASH_ID, lineup: [] }
  if (home?.folderRole !== "home" || trash.folderRole !== "trash") throw new Error("no home")
  const binned: World = {
    ...outside,
    folders: {
      ...outside.folders,
      [HOME_ID]: { ...home, lineup: [] },
      [TRASH_ID]: {
        ...trash,
        lineup: [{ kind: "binder", id: "n1", trashed: "2026-01-01T00:00:00.000Z", from: [HOME_ID] }],
      },
    },
  }
  expect(ask(binned, base("page-remove"), { page: "s1" })).toEqual([noBook, noBook])
})

test("足して、足して、複製した外のバインダは、読み直しても読める", () => {
  let { outside: world } = both([slide("s1", "1")])
  const ctx = ctxOf()
  const steps: [string, unknown][] = [
    [base("page-add"), { type: SLIDE, into: { binder: "n1" } }],
    [base("page-add"), { type: SLIDE, into: { binder: "n1" } }],
    [base("page-duplicate"), { page: "s1" }],
  ]
  for (const [id, args] of steps) {
    const done = performIn(world, id, args, { book: "n1" }, ctx)
    if (!done.ok) throw new Error(`${id}: ${JSON.stringify(done)}`)
    world = { ...world, ...withChanges(world, done.changes ?? { pages: {}, folders: {} }) }
  }
  const rows = [Object.values(world.pages), Object.values(world.folders)] as const
  expect(unreadableUnitsOf(CORE_CATALOG, ...rows)).toEqual([])
  const read = readLibrary(CORE_CATALOG, ...rows)
  expect(outsideBinderIn(read.library, "n1")?.lineup).toHaveLength(4)
  const ids = Object.keys(world.pages)
  expect(new Set(ids).size).toBe(ids.length)
})

test("外のバインダのページを消すとアノテーションも消え、変わらないページのアノテーションは残る", () => {
  const { outside } = both()
  const note = { id: "a1", kind: "@matomezu/base:note", anchors: [], text: "x" } as never
  const world = { ...outside, annotations: { s1: [note], s2: [note] } }
  const done = performIn(world, base("page-remove"), { page: "s2" }, { book: "n1" }, ctxOf())
  expect(done.ok && done.annotations).toEqual({ s2: [] })
})

test("run が受けるのは、バインダの id と、そのバインダ 1 つだけの並び。並びのほかに返した物は捨てる", () => {
  const seen: unknown[] = []
  const PEEK = "@ex/peek:peek"
  const peek = defineAction({
    id: PEEK,
    title: "@matomezu/drawing:Drawing",
    aiDescription: "records what it is given",
    attach: { books: true },
    target: "book",
    permissionScope: { creates: "type" },
    args: z.strictObject({ type: z.string() }),
    run: book => {
      seen.push(book)
      // @ts-expect-error 並びを受けるアクションは、ブックの名前を読めない
      void book.title
      return { next: { ...book, title: "書き換え" } as typeof book, result: {} }
    },
  })
  const catalog = {
    ...CORE_CATALOG,
    actions: new Map<string, unknown>([...CORE_CATALOG.actions, [PEEK, peek]]),
  } as unknown as typeof CORE_CATALOG
  const { outside } = both()
  const binder = outsideBinderIn(outside, "n1")
  expect(performIn(outside, PEEK, { type: SLIDE }, { book: "n1" }, ctxOf(catalog))).toEqual({ ok: true, result: {} })
  expect(seen).toEqual([{ id: "n1", lineup: [binder] }])
})

test("withBinderEntry は、バインダの行の並びと中のページの行だけを替える", () => {
  const { outside } = both()
  const was = outsideBinderIn(outside, "n1") as BinderEntry
  const [s1, , s3] = was.lineup as [AnyPage, AnyPage, AnyPage]
  const next = withBinderEntry(outside, was, { ...was, lineup: [s3, { ...s1, title: "改" }] })
  expect(outsideBinderIn(next, "n1")?.lineup.map(p => [p.id, p.title])).toEqual([
    ["s3", "3"],
    ["s1", "改"],
  ])
  expect(Object.keys(next.pages).sort()).toEqual(["s1", "s3"])
  expect(withBinderEntry(outside, was, was)).toBe(outside)
})

test("画面の問い（openedAnswer。所で問う）は、行う前の問い（permittedIn。引数で問う）と同じ答えになる", () => {
  const locked = [slide("s1", "1"), slide("s2", "2", { locked: true }), slide("s3", "3")]
  const { outside } = both(locked)
  const binder = outsideBinderIn(outside, "n1") as BinderEntry
  const opened = binder.lineup[0] as BinderEntry["lineup"][number]
  const on = { ...outsideAsked(outside.folders, opened), binder }
  // アクション・引数・その引数の所（コマンドの許可スコープが出す形）
  const cases: [string, unknown, Where | undefined][] = [
    [base("page-add"), { type: SLIDE, into: { binder: "n1" } }, { creates: SLIDE }],
    [base("page-remove"), { page: "s1" }, { page: "s1" }],
    [base("page-remove"), { page: "s2" }, { page: "s2" }],
    [base("page-move"), { page: "s3", index: 0 }, { entries: ["s3"] }],
    [base("binder-update"), { binder: "n1", orientation: "portrait" }, { entries: ["n1"] }],
    // 何にも問わない所は、行う者だけで決まる
    [base("page-remove"), { page: "nothing" }, { page: "nothing" }],
    // ブックにだけ行えるアクションは、使えない
    [base("book-update"), { title: "名前" }, {}],
  ]
  for (const [id, args, where] of cases) {
    const asked = openedAnswer(CORE_CATALOG, id, on, where, { controlCenter: NO_CONTROL_CENTER })
    const permitted = permittedIn(outside, id, args, { book: "n1" }, ctxOf())
    expect([id, args, asked.value === true]).toEqual([id, args, permitted.ok])
  }
  // どのページも変える所（allPages）は、ブックの中と同じく、ロックしたページが 1 枚でも在れば使えない（ページごとに飛ばすのは、行うときの pages の形だけ）
  expect(
    openedAnswer(CORE_CATALOG, base("pages-update"), on, { allPages: true }, { controlCenter: NO_CONTROL_CENTER })
      .value,
  ).toBe(false)
  expect(
    openedAnswer(CORE_CATALOG, base("page-remove"), on, { page: "s2" }, { controlCenter: NO_CONTROL_CENTER }),
  ).toMatchObject({
    value: false,
    decidedBy: { source: "permission", id: base("lock") },
  })
})
