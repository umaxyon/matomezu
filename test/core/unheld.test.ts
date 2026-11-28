// 中身を持っていないページ（ページメタだけの行）の在る世界: 在ることと名前は読め、中身を読むアクションは needs-rows で答える
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import {
  type Folder,
  HOME_ID,
  type HomeFolder,
  isHeld,
  type Library,
  pageIn,
  pageMetaRowOf,
  TRASH_ID,
} from "../../web/src/core/folders"
import { bookOf, libraryOf, unheldIn } from "../../web/src/core/folders-books"
import { withChanges } from "../../web/src/core/folders-changes"
import { openablePageRow } from "../../web/src/core/library"
import { performIn, type World } from "../../web/src/core/perform-world"
import { deadReferences } from "../../web/src/core/references"
import type { AnyPage } from "../../web/src/core/schema/book"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, libraryWith, sequence } from "../support"

const base = (id: string) => `@matomezu/base:${id}`

const ctxOf = () =>
  ({
    catalog: CORE_CATALOG,
    controlCenter: "@matomezu/control-center:control-center",
    lang: "en" as const,
    newId: sequence(),
    now: "2026-01-01T00:00:00.000Z",
    today: "2026-01-01",
    actor: USER,
  }) as unknown as Parameters<typeof performIn>[4]

// ブック A（図 a1 と、スライドのバインダ x1）と、ブック B（図 b1）と、ブックの外の図 o1。unheld の行は中身を持っていない行にする
function start(...unheld: string[]): World {
  const library = libraryWith(
    [
      testBook("A", "A", [
        drawingPage("a1", { title: "全体図" }),
        testBinder("x1", "説明", SLIDE, testPage(SLIDE, "s1", { title: "1" }) as AnyPage),
      ]),
      testBook("B", "B", [drawingPage("b1", { title: "設計" })]),
    ],
    [drawingPage("o1", { title: "外" })],
  )
  const pages = { ...library.pages }
  for (const id of unheld) pages[id] = pageMetaRowOf(pages[id]!)
  return { ...library, pages, settings: {}, annotations: {}, records: {}, counters: {} }
}

const run = (world: World, action: string, args: unknown, on?: Parameters<typeof performIn>[3]) =>
  performIn(world, base(action), args, on, ctxOf())

test("ページメタだけの行は、土台のフィールドを残して中身を落とし、持っていない印を付ける", () => {
  const row = start().pages.a1!
  const meta = pageMetaRowOf(row)
  expect(isHeld(row)).toBe(true)
  expect(isHeld(meta)).toBe(false)
  expect(meta).toMatchObject({
    kind: "page",
    id: "a1",
    type: row.type,
    title: "全体図",
    paper: row.paper,
    unheld: true,
  })
  expect("items" in meta).toBe(false)
})

test("中身を持っていないページの在るブック・バインダは組まず、持っていないページを unheldIn が挙げる", () => {
  const world = start("s1")
  expect(bookOf(world, "A")).toBeUndefined()
  expect(bookOf(world, "B")).toBeDefined()
  expect(Object.keys(libraryOf(world))).toEqual(["B"])
  expect(unheldIn(world, "A")).toEqual(["s1"])
  expect(unheldIn(world, "x1")).toEqual(["s1"])
  expect(unheldIn(world, "B")).toEqual([])
  expect(pageIn(world.pages, "s1")).toBeUndefined()
})

test("宛先のブックに中身を持っていないページがあれば、ブック・ページ・アノテーションが対象のアクションは needs-rows でそのページを名指す", () => {
  const world = start("a1")
  expect(run(world, "page-remove", { page: "a1" }, { book: "A" })).toEqual({
    ok: false,
    reason: "needs-rows",
    books: ["a1"],
  })
  expect(run(world, "page-update", { title: "新" }, { page: "s1" })).toEqual({
    ok: false,
    reason: "needs-rows",
    books: ["a1"],
  })
  expect(run(start("o1"), "page-update", { title: "新" }, { page: "o1" })).toEqual({
    ok: false,
    reason: "needs-rows",
    books: ["o1"],
  })
})

test("openablePageRow は、中身を持っていないページの行も開ける所から引き、ゴミ箱の中・読めないブックのページは引かない", () => {
  const world = start("a1", "b1", "o1")
  expect(openablePageRow(world, "a1")?.outermost).toEqual({ kind: "book", id: "A" })
  expect(openablePageRow(world, "s1")?.row.title).toBe("1")
  expect(openablePageRow(world, "o1")?.outermost).toEqual({ kind: "page", id: "o1" })
  const home = world.folders[HOME_ID] as HomeFolder
  const trashed: Library = {
    pages: world.pages,
    folders: {
      ...world.folders,
      [HOME_ID]: { ...home, lineup: home.lineup.filter(r => r.id !== "B" && r.id !== "o1") },
      [TRASH_ID]: {
        folderRole: "trash",
        id: TRASH_ID,
        lineup: [
          { kind: "book", id: "B" },
          { kind: "page", id: "o1" },
        ],
      } as unknown as Folder,
    },
  }
  expect(openablePageRow(trashed, "b1")).toBeUndefined()
  expect(openablePageRow(trashed, "o1")).toBeUndefined()
  const { s1: _, ...lost } = world.pages
  expect(openablePageRow({ pages: lost, folders: world.folders }, "a1")).toBeUndefined()
})

test("中身を持っていないページがどこかにあれば、書庫が対象のアクションは needs-rows で答える", () => {
  expect(run(start("b1"), "entry-trash", { entry: "o1" })).toEqual({ ok: false, reason: "needs-rows", books: ["b1"] })
  expect(run(start(), "entry-trash", { entry: "o1" }).ok).toBe(true)
})

test("中身を持っていないページは在る物として読む: ほかのブックから指せて、参照エントリは外れない", () => {
  const world = start("a1")
  const done = run(world, "reference-add", { of: { kind: "page", id: "a1" } }, { book: "B" })
  if (!done.ok) throw new Error(JSON.stringify(done))
  const now: Library = withChanges(world, done.changes!)
  const b = now.folders.B as Folder & { folderRole: "book" }
  expect(b.lineup.some(r => r.kind === "reference" && r.of.id === "a1")).toBe(true)
  expect(deadReferences(now)).toEqual({})
  // 持っているブックのページを直すアクションは、ほかのブックが中身を持っていなくても行える
  expect(run(world, "page-update", { title: "新" }, { page: "b1" }).ok).toBe(true)
})
