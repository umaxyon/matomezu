// 参照エントリ: ブックの並びに、ほかの所のページかバインダを見るだけで置く。置ける先・同じ書き込みで消える場合・残る場合を、書庫ごと行って確かめる
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { referencesOf } from "../../web/src/core/book"
import { type Folder, type Library, TRASH_ID } from "../../web/src/core/folders"
import { bookOf, libraryOf } from "../../web/src/core/folders-books"
import { withChanges } from "../../web/src/core/folders-changes"
import { changesByCause } from "../../web/src/core/history"
import { normalizedLibrary } from "../../web/src/core/perform-library"
import { performIn, type World } from "../../web/src/core/perform-world"
import {
  deadReferences,
  referable,
  referableIn,
  referredLineup,
  referredOf,
  UNSEEN,
} from "../../web/src/core/references"
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

const worldOf = (library: Library): World => ({ ...library, settings: {}, annotations: {}, records: {}, counters: {} })

// ブック A（図 a1 と、スライドのバインダ n1）と、ブック B（図 b1）と、ブックの外の図 o1
const start = () =>
  worldOf(
    libraryWith(
      [
        testBook("A", "A", [
          drawingPage("a1", { title: "全体図" }),
          testBinder("x1", "説明", SLIDE, testPage(SLIDE, "s1", { title: "1" }) as AnyPage),
        ]),
        testBook("B", "B", [drawingPage("b1", { title: "設計" })]),
      ],
      [drawingPage("o1", { title: "外" })],
    ),
  )

// world で、宛先 on に action を行った後の世界（断られたら、その断り）
function after(world: World, action: string, args: unknown, on?: Parameters<typeof performIn>[3]) {
  const done = performIn(world, base(action), args, on, ctxOf())
  if (!done.ok) return done
  return { ...world, ...withChanges(world, done.changes ?? { pages: {}, folders: {} }), result: done.result }
}

const refsIn = (world: Library, book: string) =>
  referencesOf(bookOf(world, book) ?? { id: book, lineup: [] }).map(r => r.of.id)

const added = (world: World, of: { kind: "page" | "binder"; id: string }) => {
  const done = after(world, "reference-add", { of }, { book: "B" })
  if (!("result" in done)) throw new Error(JSON.stringify(done))
  return done
}

test("ほかのブックのページ・バインダと、ブックの外のページを参照できる", () => {
  const world = added(added(added(start(), { kind: "page", id: "a1" }), { kind: "binder", id: "x1" }), {
    kind: "page",
    id: "o1",
  })
  expect(refsIn(world, "B")).toEqual(["a1", "x1", "o1"])
})

test("在らない物・このブックの物・ゴミ箱の物・2 つ目の同じ先は断る", () => {
  const world = start()
  const refused = (of: { kind: "page" | "binder"; id: string }, w: World = world) =>
    "result" in after(w, "reference-add", { of }, { book: "B" })
  expect(refused({ kind: "page", id: "none" })).toBe(false)
  expect(refused({ kind: "page", id: "b1" })).toBe(false)
  expect(refused({ kind: "page", id: "s1" })).toBe(false) // バインダの中のページ（スライドはバインダを指す）
  expect(refused({ kind: "binder", id: "a1" })).toBe(false)
  expect(refused({ kind: "page", id: "a1" }, added(world, { kind: "page", id: "a1" }))).toBe(false)
  const trashed = after(world, "entry-trash", { entry: "o1" })
  expect("result" in trashed).toBe(true)
  expect(refused({ kind: "page", id: "o1" }, trashed as World)).toBe(false)
})

test("指す先がゴミ箱に入っても、ブックの外へ動いても残る。ゴミ箱の間は描く物が無い", () => {
  const world = added(start(), { kind: "page", id: "a1" })
  const moved = after(world, "entry-move", { entry: "a1", into: "library-home" }) as World
  expect("result" in moved).toBe(true)
  expect(refsIn(moved, "B")).toEqual(["a1"])
  const trashed = after(moved, "entry-trash", { entry: "a1" }) as World
  expect(refsIn(trashed, "B")).toEqual(["a1"])
  const ref = referencesOf(bookOf(trashed, "B")!)[0]!
  expect(referredOf(trashed, ref)).toBe(UNSEEN)
  expect(referredOf(moved, ref)).toEqual({ kind: "page", page: moved.pages.a1! })
})

test("指す先を完全に消すと、同じ書き込みで参照も消える", () => {
  const world = added(start(), { kind: "page", id: "a1" })
  const removed = after(world, "page-remove", { page: "a1" }, { book: "A" }) as World
  expect(refsIn(removed, "B")).toEqual([])
  const trashed = after(world, "entry-trash", { entry: "A" }) as World
  expect(refsIn(trashed, "B")).toEqual(["a1"])
  const purged = after(trashed, "entry-purge", { entries: ["A"] }) as World
  expect(refsIn(purged, "B")).toEqual([])
  expect(purged.folders[TRASH_ID]?.lineup).toEqual([])
})

test("指す先を参照したブックへ動かすと、参照は消えて実物が入る", () => {
  const world = added(start(), { kind: "page", id: "a1" })
  const moved = after(world, "entry-move", { entry: "a1", into: "B" }) as World
  expect(refsIn(moved, "B")).toEqual([])
  expect(bookOf(moved, "B")?.lineup.map(e => e.id)).toContain("a1")
})

test("参照を消しても、指す先は変わらない。参照は名前の重なりに数えない", () => {
  const world = added(start(), { kind: "page", id: "a1" })
  const id = (world as { result: { reference: string } }).result.reference
  const named = after(world, "page-update", { title: "全体図" }, { page: "b1" })
  expect("result" in named).toBe(true)
  const removed = after(world, "reference-remove", { reference: id }, { book: "B" }) as World
  expect(refsIn(removed, "B")).toEqual([])
  expect(removed.pages.a1).toBe(world.pages.a1)
})

test("バックヤードの中のブックには置けず、バックヤードの中の物は指せない", () => {
  const world = start()
  const yard = {
    ...world,
    pages: { ...world.pages, w1: drawingPage("w1", { title: "w" }) },
    folders: {
      ...world.folders,
      yard: { folderRole: "backyard", id: "yard", lineup: [{ kind: "book", id: "W" }] },
      W: { folderRole: "book", id: "W", title: "W", lineup: [{ kind: "page", id: "w1" }] },
    },
  } as unknown as World
  expect("result" in after(yard, "reference-add", { of: { kind: "page", id: "w1" } }, { book: "B" })).toBe(false)
  expect("result" in after(yard, "reference-add", { of: { kind: "page", id: "a1" } }, { book: "W" })).toBe(false)
})

test("指す先のページがバインダに入っていれば、整えるときに参照を外す（置くときと同じ決まり）", () => {
  const world = start()
  const b = world.folders.B as { lineup: readonly object[] }
  const odd = {
    ...world,
    folders: {
      ...world.folders,
      B: { ...b, lineup: [...b.lineup, { kind: "reference", id: "r9", of: { kind: "page", id: "s1" } }] },
    },
  } as unknown as World
  expect(Object.keys(deadReferences(odd))).toEqual(["B"])
})

test("参照は並びの中で動かせる。動かない所・並びの外への動きは断る", () => {
  const world = added(start(), { kind: "page", id: "a1" })
  const id = (world as { result: { reference: string } }).result.reference
  const moved = after(world, "reference-move", { reference: id, index: 0 }, { book: "B" }) as World
  expect(lineupOfBook(moved, "B")).toEqual([id, "b1"])
  expect("result" in after(world, "reference-move", { reference: id }, { book: "B" })).toBe(false)
  expect("result" in after(world, "reference-move", { reference: id, index: 2 }, { book: "B" })).toBe(false)
  expect("result" in after(world, "reference-move", { reference: "b1", index: 0 }, { book: "B" })).toBe(false)
})

const lineupOfBook = (world: Library, book: string) => (bookOf(world, book)?.lineup ?? []).map(e => e.id)

test("置けるか（referable と、フォルダの表だけで答える referableIn）は、置くアクションが通るかと同じ。ブックでない先・ゴミ箱の中のブックにも置けない", () => {
  const world = start()
  const cases: { of: { kind: "page" | "binder"; id: string }; w?: World }[] = [
    { of: { kind: "page", id: "a1" } },
    { of: { kind: "binder", id: "x1" } },
    { of: { kind: "page", id: "o1" } },
    { of: { kind: "page", id: "none" } },
    { of: { kind: "page", id: "b1" } },
    { of: { kind: "page", id: "s1" } },
    { of: { kind: "binder", id: "a1" } },
    { of: { kind: "page", id: "a1" }, w: added(world, { kind: "page", id: "a1" }) },
  ]
  for (const c of cases) {
    const w = c.w ?? world
    const done = "result" in after(w, "reference-add", { of: c.of }, { book: "B" })
    expect([c.of.id, referable(w, "B", c.of), referableIn(w.folders, "B", c.of)]).toEqual([c.of.id, done, done])
  }
  expect(referable(world, "a1", { kind: "page", id: "o1" })).toBe(false)
  expect(referableIn(world.folders, "a1", { kind: "page", id: "o1" })).toBe(false)
  const trashed = after(world, "entry-trash", { entry: "B" }) as World
  expect(referable(trashed, "B", { kind: "page", id: "a1" })).toBe(false)
  expect(referableIn(trashed.folders, "B", { kind: "page", id: "a1" })).toBe(false)
})

test("参照エントリを指す先の物に置き換えた並び（印刷）: ページ・バインダは中身ごと並びの所に入り、指す先が見えない物は飛ばす", () => {
  const world = added(added(added(start(), { kind: "page", id: "a1" }), { kind: "binder", id: "x1" }), {
    kind: "page",
    id: "o1",
  })
  const lineupOf = (w: World) => referredLineup({ ...w, books: libraryOf(w) }, bookOf(w, "B")?.lineup ?? [])
  const done = lineupOf(world)
  expect(done.lineup.map(e => e.id)).toEqual(["b1", "a1", "x1", "o1"])
  expect(done.lineup[2]?.kind === "binder" && done.lineup[2].lineup.map(p => p.id)).toEqual(["s1"])
  expect([...done.referred].map(([page, r]) => [page, r.outermost])).toEqual([
    ["a1", "A"],
    ["s1", "A"],
    ["o1", "o1"],
  ])
  const trashed = after(world, "entry-trash", { entry: "A" }) as World
  expect(lineupOf(trashed).lineup.map(e => e.id)).toEqual(["b1", "o1"])
})

test("画面の履歴の段の持ち主: 指す先を消されて参照エントリが外れただけのブックの分は、消した側の分に寄せる。ほかにも変わったブックは寄せない", () => {
  const world = added(start(), { kind: "page", id: "a1" })
  const done = performIn(world, base("page-remove"), { page: "a1" }, { book: "A" }, ctxOf())
  if (!done.ok || !done.changes) throw new Error("page-remove")
  const caused = changesByCause(world, withChanges(world, done.changes), done.changes)
  expect(Object.keys(caused)).toEqual(["A"])
  expect(caused.A?.also).toEqual(["B"])
  expect(Object.keys(caused.A?.changes.folders ?? {})).toContain("B")
  // B の名前も変えた書き込みなら、B は自分の分のまま
  const b = done.changes.folders.B as Folder & { folderRole: "book" }
  const both = { ...done.changes, folders: { ...done.changes.folders, B: { ...b, title: "B2" } } }
  const own = changesByCause(world, withChanges(world, both), both)
  expect(Object.keys(own).sort()).toEqual(["A", "B"])
  expect(own.A?.also).toEqual([])
})

test("書庫が対象のアクションが新しく置いた参照エントリも、置けない物なら perform が断る（もとから在る物は見ない）", () => {
  const world = start()
  const action = CORE_CATALOG.actions.get(base("library-reference-add"))!
  const b = world.folders.B as Folder & { folderRole: "book" }
  const withRef = (of: { kind: "page" | "binder"; id: string }) =>
    ({
      ...world,
      folders: { ...world.folders, B: { ...b, lineup: [...b.lineup, { kind: "reference", id: "r1", of }] } },
    }) as World
  expect(normalizedLibrary(CORE_CATALOG, action, world, withRef({ kind: "page", id: "s1" }))).toBeNull()
  expect(normalizedLibrary(CORE_CATALOG, action, world, withRef({ kind: "page", id: "a1" }))).not.toBeNull()
  const odd = withRef({ kind: "page", id: "s1" })
  expect(normalizedLibrary(CORE_CATALOG, action, odd, odd)).not.toBeNull()
})

test("新しく置いた参照エントリの指す先の行が世界に無ければ、needs-rows でその id を名指す（常駐が行を足して行い直す）", () => {
  expect(performIn(start(), base("reference-add"), { of: { kind: "page", id: "zz" } }, { book: "B" }, ctxOf())).toEqual(
    {
      ok: false,
      reason: "needs-rows",
      books: ["zz"],
    },
  )
})
