// ブックの外のページ（どのブックにも入っていないページ）も、行う前の問いと行った後の確かめに掛かる。
// 外のページは、テストの用意として書庫の表に直に置く（作る道のアクションは通さない）
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import { type ActionDef, defineAction } from "../../web/src/core/def/action"
import type { PermissionQuery } from "../../web/src/core/def/permission"
import {
  type AnyEntryRef,
  type BinderFolder,
  bookOf,
  HOME_ID,
  type HomeFolder,
  type Library,
  NO_CHANGES,
  type PlainFolder,
  TRASH_ID,
  tablesOf,
  withChanges,
} from "../../web/src/core/folders"
import { defineMessages } from "../../web/src/core/i18n/messages"
import {
  brokenIn,
  libraryAsksOf,
  pageChecksBetween,
  performIn,
  permittedIn,
  type World,
} from "../../web/src/core/perform"
import type { ItemPage } from "../../web/src/core/placed"
import type { AnyPage, Book } from "../../web/src/core/schema/book"
import { pluginKit } from "../../web/src/store/kit"
import { DRAWING, drawingPage, SLIDE, testBook, testPage } from "../lineup"
import { CORE_CATALOG, sequence } from "../support"

const LOCK = "@matomezu/base:lock"
const MOVE = "@matomezu/base:entry-move"

const ctxOf = () =>
  ({
    catalog: CORE_CATALOG,
    controlCenter: null,
    lang: "en" as const,
    newId: sequence(),
    now: "2026-01-01T00:00:00.000Z",
    today: "2026-01-01",
    actor: USER,
  }) as never

// ブック books と、書庫ホームの直下に置いたブックの外のページ outside の書庫（ホームの並びは、ブックのあとに外のページ）
function libraryWith(books: readonly Book[], outside: readonly AnyPage[]): Library {
  const tables = tablesOf(books)
  const lineup: AnyEntryRef[] = [
    ...books.map(b => ({ kind: "book" as const, id: b.id })),
    ...outside.map(p => ({ kind: "page" as const, id: p.id })),
  ]
  return {
    pages: { ...tables.pages, ...Object.fromEntries(outside.map(p => [p.id, p])) },
    folders: { ...tables.folders, [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup } },
  }
}

test("ブックとの間を出入りしたページは、ブックの側とページの側の両方で確かめる（ブックの側が見ない、入ったロックしたページの変化も止まる）", () => {
  const move = CORE_CATALOG.actions.get(MOVE) as ActionDef
  const p1 = drawingPage("p1", { title: "中", locked: true })
  const x1 = drawingPage("x1", { title: "外", locked: true })
  const was = libraryWith([testBook("b1", "ブック", [p1, drawingPage("p2", { title: "2" })])], [x1])
  // 中身を変えずに出し入れする: どちらも通る
  const swapped = libraryWith([testBook("b1", "ブック", [x1, drawingPage("p2", { title: "2" })])], [p1])
  expect(brokenIn(ctxOf(), move, was, swapped)).toBeNull()
  // ページの側の確かめは、出入りした 2 枚（ブックの中だけの p2 は入らない）
  const checks = pageChecksBetween(was, swapped)
  expect(checks.map(c => [c.change.id, c.change.change, c.place])).toEqual([
    ["p1", "changed", "moved"],
    ["x1", "changed", "moved"],
  ])
  expect(checks.map(c => [c.folders.before.map(f => f.id), c.folders.after.map(f => f.id)])).toEqual([
    [["b1"], []],
    [[], ["b1"]],
  ])
  // 外から入ったロックしたページの名前を変える: ブックの側は前のブックに無いページなので見ず、ページの側が止める
  const renamedIn = libraryWith(
    [testBook("b1", "ブック", [{ ...x1, title: "改" }, drawingPage("p2", { title: "2" })])],
    [p1],
  )
  expect(brokenIn(ctxOf(), move, was, renamedIn)).toEqual({ permission: LOCK })
  // 外へ出たロックしたページの名前を変える: ブックの側（movedOut）が止める
  const renamedOut = libraryWith(
    [testBook("b1", "ブック", [x1, drawingPage("p2", { title: "2" })])],
    [{ ...p1, title: "改" }],
  )
  expect(brokenIn(ctxOf(), move, was, renamedOut)).toEqual({ permission: LOCK, book: "b1" })
})

const CENTER = "@matomezu/control-center:control-center"
const RENAME = "@matomezu/base:entry-rename"
const TRASH = "@matomezu/base:entry-trash"
const PAGE_CREATE = "@matomezu/base:page-create"
const SNEAK = "test:sneak-rename"

// 行う前に問わず（許可スコープ "unknown"）、ブックの外のページ x1 の名前を変える書庫のアクション（行った後の確かめだけが止める）
const sneak = defineAction({
  id: SNEAK,
  title: "@matomezu/base:Change pages",
  aiDescription: "",
  target: "library",
  permissionScope: "unknown",
  args: z.strictObject({}),
  run: library => {
    const row = library.pages.x1
    return row ? { next: { ...library, pages: { ...library.pages, x1: { ...row, title: "改" } } }, result: {} } : null
  },
})

// 問いを覚える認可ステップ（止めない）
const seen: PermissionQuery[] = []
const kit = pluginKit("@ex/seen", defineMessages({ seen: { en: "Seen", ja: "見た" } }))
const SEEN = kit.definePermission({
  id: "seen",
  title: "seen",
  aiDescription: "records what it is asked",
  denies: q => {
    seen.push(q)
    return false
  },
})
const catalog = {
  ...CORE_CATALOG,
  actions: new Map<string, unknown>([...CORE_CATALOG.actions, [SNEAK, sneak]]),
  permissions: new Map<string, unknown>([...CORE_CATALOG.permissions, [`@ex/seen:${SEEN.id}`, SEEN]]),
  controlCenters: new Map<string, unknown>([
    ...CORE_CATALOG.controlCenters,
    ["test:center", { id: "test:center", actions: [SNEAK] }],
  ]),
} as unknown as typeof CORE_CATALOG
const libraryCtx = (controlCenter = CENTER) =>
  ({ ...(ctxOf() as object), catalog, controlCenter }) as unknown as Parameters<typeof performIn>[4]

// 書庫ホームの直下に、ブック b1・フォルダ a・ロックしたブックの外のページ x1・ブックの外のバインダ lb（中に y1・y2）を置いた世界
function outsideWorld(): World {
  const lb: BinderFolder = {
    folderRole: "binder",
    id: "lb",
    title: "束",
    pageType: SLIDE,
    lineup: [
      { kind: "page", id: "y1" },
      { kind: "page", id: "y2" },
    ],
  }
  const a: PlainFolder = { folderRole: "folder", id: "a", title: "あ", lineup: [] }
  const library = libraryWith(
    [testBook("b1", "ブック", [drawingPage("p1")])],
    [drawingPage("x1", { title: "外", locked: true })],
  )
  const home = library.folders[HOME_ID] as HomeFolder
  return {
    pages: {
      ...library.pages,
      y1: testPage(SLIDE, "y1", { title: "1" }),
      y2: testPage(SLIDE, "y2", { title: "2", locked: true }),
    },
    folders: {
      ...library.folders,
      lb,
      a,
      [HOME_ID]: {
        ...home,
        lineup: [...home.lineup, { kind: "binder", id: "lb" }, { kind: "folder", id: "a" }],
      },
    },
    settings: {},
    annotations: {},
    records: {},
    counters: {},
  }
}

test("ブックの外のエントリは、ページへの問い（kind page）で、エントリの変え方 where.entry を添えて問われる。バインダは中のページごと、フォルダは中の外のページも", () => {
  const w = outsideWorld()
  const asked = (id: string, args: unknown, at: World = w) => {
    seen.length = 0
    permittedIn(at, id, args, undefined, libraryCtx())
    return seen.map(q => (q.kind === "page" ? [q.page.id, q.folders.map(f => f.id), q.where] : [q.kind]))
  }
  expect(asked(RENAME, { entry: "x1", title: "新" })).toEqual([["x1", [], { entry: "title" }]])
  expect(asked(MOVE, { entry: "x1", into: "a" })).toEqual([["x1", [], { entry: "place" }]])
  expect(asked(TRASH, { entry: "lb" })).toEqual([
    ["y1", ["lb"], { entry: "all-pages" }],
    ["y2", ["lb"], { entry: "all-pages" }],
  ])
  // バインダの名前だけを変えるなら、中のページには問わない
  expect(asked(RENAME, { entry: "lb", title: "新" })).toEqual([])
  // フォルダを中身ごとゴミ箱へ入れるなら、中のブックの外のページにも問う
  const inA = {
    ...w,
    folders: {
      ...w.folders,
      [HOME_ID]: { ...(w.folders[HOME_ID] as HomeFolder), lineup: [{ kind: "folder", id: "a" }] },
      a: { ...(w.folders.a as PlainFolder), lineup: [{ kind: "page", id: "x1" }] },
    },
  } as World
  expect(asked(TRASH, { entry: "a" }, inA)).toEqual([["x1", [], { entry: "all-pages" }]])
})

test("ページを作る先がブックならそのブックに作るタイプで、ブックの外なら、そのタイプの空のページで問われる（folders は空）", () => {
  const w = outsideWorld()
  const asks = (into?: string) =>
    libraryAsksOf(catalog, w, { books: [], pages: [{ creates: DRAWING, into }], creates: false })
  expect(asks("b1")).toEqual([{ book: bookOf(w, "b1") as Book, where: { creates: DRAWING } }])
  for (const into of ["a", undefined]) {
    const [ask] = asks(into)
    expect(ask && "page" in ask ? [ask.page.page.type, ask.page.page.kind, ask.page.folders] : ask).toEqual([
      DRAWING,
      "page",
      [],
    ])
  }
  // page-create の行う前の問いも、ブックの外へ作るなら空のページで問う（作る道は断る）
  seen.length = 0
  permittedIn(w, PAGE_CREATE, { folder: "a", type: DRAWING }, undefined, libraryCtx())
  expect(seen.map(q => (q.kind === "page" ? [q.page.type, q.folders] : q.kind))).toEqual([[DRAWING, []]])
  expect(performIn(w, PAGE_CREATE, { folder: "a", type: DRAWING }, undefined, libraryCtx())).toMatchObject({
    ok: false,
    reason: "refused",
  })
})

test("ロックしたブックの外のページは、動かせるが、名前を変えられず、ゴミ箱にも入れられない（行う前の問いで止まり、すり抜けても行った後の確かめで止まる）", () => {
  const w = outsideWorld()
  const moved = performIn(w, MOVE, { entry: "x1", into: "a" }, undefined, libraryCtx())
  expect(moved.ok).toBe(true)
  const denied = { ok: false, reason: "denied", permission: LOCK } as const
  for (const [id, args] of [
    [RENAME, { entry: "x1", title: "新" }],
    [TRASH, { entry: "x1" }],
    [TRASH, { entry: "lb" }],
  ] as const) {
    expect(permittedIn(w, id, args, undefined, libraryCtx())).toEqual(denied)
    expect(performIn(w, id, args, undefined, libraryCtx())).toEqual(denied)
  }
  // 行う前に問わないアクションでも、行った後の確かめで止まる
  expect(permittedIn(w, SNEAK, {}, undefined, libraryCtx("test:center"))).toEqual({ ok: true })
  expect(performIn(w, SNEAK, {}, undefined, libraryCtx("test:center"))).toEqual(denied)
})

const PLACE = "@matomezu/paper:item-place"
const BOX = "@matomezu/box:shape-nest-box"
const UPDATE = "@matomezu/base:page-update"

// 書庫ホームの直下に、ブック b1 と、ブックの外のページ x1・ロックした x2 を置いた世界
function pagesWorld(): World {
  return {
    ...libraryWith(
      [testBook("b1", "ブック", [drawingPage("p1")])],
      [
        drawingPage("x1", { title: "外" }),
        drawingPage("x2", {
          title: "鍵",
          locked: true,
          items: [{ id: "a", item: BOX, x: 0, y: 0, props: { caption: "a", body: "" } }],
        }),
      ],
    ),
    settings: {},
    annotations: {},
    records: {},
    counters: {},
  }
}
const pageOf = (w: World, done: ReturnType<typeof performIn>, id: string) =>
  (done.ok ? withChanges(w, done.changes ?? NO_CHANGES) : w).pages[id] as ItemPage

test("ブックの外のページに、ページが対象のアクションでアイテムを置ける。変わるのはそのページの行だけ。行う前の問いも同じ答え", () => {
  const w = pagesWorld()
  const args = { item: BOX, at: { x: 100, y: 100 } }
  expect(permittedIn(w, PLACE, args, { page: "x1" }, libraryCtx())).toEqual({ ok: true })
  const done = performIn(w, PLACE, args, { page: "x1" }, libraryCtx())
  if (!done.ok) throw new Error(done.reason)
  expect(Object.keys(done.changes?.pages ?? {})).toEqual(["x1"])
  expect(done.changes?.folders).toEqual({})
  expect(pageOf(w, done, "x1").items?.map(i => i.item)).toEqual([BOX])
  // ゴミ箱の中のページは無いものとする
  const binned = {
    ...w,
    folders: {
      ...w.folders,
      [HOME_ID]: { ...(w.folders[HOME_ID] as HomeFolder), lineup: [{ kind: "book", id: "b1" }] },
      [TRASH_ID]: {
        folderRole: "trash",
        id: TRASH_ID,
        lineup: [{ kind: "page", id: "x1", trashed: "2026-01-01T00:00:00.000Z", from: [HOME_ID] }],
      },
    },
  } as World
  expect(performIn(binned, PLACE, args, { page: "x1" }, libraryCtx())).toMatchObject({ ok: false, reason: "no-page" })
})

test("ブックの外の可変ページにも、ページ 1 枚ずつのノーマライズステップがかかる（左・上へも伸びるなら、空きの印刷区画を持つよう中身をずらす）", () => {
  let w = pagesWorld()
  const step = (id: string, args: unknown) => {
    const done = performIn(w, id, args, { page: "x1" }, libraryCtx())
    if (!done.ok) throw new Error(done.reason)
    w = { ...w, ...withChanges(w, done.changes ?? NO_CHANGES) }
  }
  step(PLACE, { item: BOX, at: { x: 100, y: 100 } })
  step(UPDATE, { grows: "all" })
  const x1 = w.pages.x1 as ItemPage
  expect(x1.shift).toEqual({ x: 1, y: 1 })
  expect(x1.items?.[0]).toMatchObject({ x: 1223, y: 894 })
})

test("ロックしたブックの外のページは、ページが対象のアクションで中身も名前も変えられない（行う前の問いで止まる）。伝言は付けられる", () => {
  const w = pagesWorld()
  const denied = { ok: false, reason: "denied", permission: LOCK } as const
  expect(performIn(w, PLACE, { item: BOX, at: { x: 100, y: 100 } }, { page: "x2" }, libraryCtx())).toEqual(denied)
  expect(permittedIn(w, UPDATE, { title: "改" }, { page: "x2" }, libraryCtx())).toEqual(denied)
  const noted = performIn(w, "@matomezu/base:note-add", { anchors: ["a"], text: "見て" }, { page: "x2" }, libraryCtx())
  expect(noted.ok && noted.annotations?.x2?.length).toBe(1)
})

test("ブックの外のバインダの中のページも、紙と向きをほかのページとそろえたままにする（変えれば断る）", () => {
  const w = outsideWorld()
  expect(performIn(w, UPDATE, { orientation: "portrait" }, { page: "y1" }, libraryCtx())).toEqual({
    ok: false,
    reason: "refused",
  })
  expect(performIn(w, UPDATE, { title: "改" }, { page: "y1" }, libraryCtx()).ok).toBe(true)
  // バインダに入っていないページは、向きを変えられる
  expect(performIn(pagesWorld(), UPDATE, { orientation: "portrait" }, { page: "x1" }, libraryCtx()).ok).toBe(true)
})
