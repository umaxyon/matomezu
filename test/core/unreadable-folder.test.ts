// 読めない物のフォルダ（core/unreadable.ts）: 読めない物は在った所から移り、読めるようになると在った所へ戻る。行の中身には手を付けない
import { describe, expect, test } from "bun:test"
import { checkBooks, readLibrary, unreadableUnitsOf } from "../../web/src/core/book"
import type { CoreCatalog } from "../../web/src/core/core-catalog"
import {
  BROKEN,
  FIRST,
  type Folders,
  foldersOver,
  HOME_ID,
  outsideUnreadable,
  rawBooksOf,
  rowsHoldTree,
  TRASH_ID,
  treeHolds,
  UNREADABLE_ID,
  type UnreadableFolder,
} from "../../web/src/core/folders"
import { purgedRows, type Settled, settleLibrary } from "../../web/src/core/unreadable"
import { DRAWING, drawingPage, MARKDOWN, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, NAMING, worldRows } from "../support"

const NOW = "2026-11-20T00:00:00.000Z"
const LATER = "2026-11-21T00:00:00.000Z"

// タイプ types を持たない機能台帳（そのタイプのプラグインを外した所）
function without(...types: string[]): CoreCatalog {
  const drop = <V>(m: ReadonlyMap<string, V>) => new Map([...m].filter(([id]) => !types.includes(id)))
  return { ...CORE_CATALOG, pageTypes: drop(CORE_CATALOG.pageTypes), pageSchemas: drop(CORE_CATALOG.pageSchemas) }
}
const NO_MARKDOWN = without(MARKDOWN)
const NO_SLIDE = without(SLIDE)

const md = (id: string, title = id) => testPage(MARKDOWN, id, { title })
const slide = (id: string, title = id) => testPage(SLIDE, id, { title } as never)

interface Rows {
  pages: unknown[]
  folders: unknown[]
}

// 書く行の変わりを rows に当てた行（足した行は末尾に）
function applied(rows: Rows, done: Settled | typeof BROKEN): Rows {
  if (done === BROKEN) throw new Error("broken")
  const put = (list: unknown[], puts: Readonly<Record<string, unknown>>, gone: readonly string[]) => {
    const ids = new Set(Object.keys(puts))
    const kept = list.flatMap(r => {
      const id = (r as { id: string }).id
      if (gone.includes(id)) return []
      return [ids.has(id) ? puts[id] : r]
    })
    const have = new Set(kept.map(r => (r as { id: string }).id))
    return [...kept, ...Object.entries(puts).flatMap(([id, r]) => (have.has(id) ? [] : [r]))]
  }
  return {
    pages: put(rows.pages, done.writes.pages, done.writes.removedPages),
    folders: put(rows.folders, done.writes.folders, done.writes.removedFolders),
  }
}

const settle = (catalog: CoreCatalog, rows: Rows, now = NOW) =>
  settleLibrary(catalog, rows.pages, rows.folders, { naming: NAMING, now, newId: () => "new" })
const settled = (catalog: CoreCatalog, rows: Rows, now = NOW) => applied(rows, settle(catalog, rows, now))
const unreadableOf = (rows: Rows): UnreadableFolder =>
  rows.folders.find(f => (f as { id: string }).id === UNREADABLE_ID) as UnreadableFolder
const folderOf = (rows: Rows, id: string) =>
  rows.folders.find(f => (f as { id: string }).id === id) as { lineup: { kind?: string; id: string }[] }
// 行の id ごとの中身（並べた順に依らずに比べる）
const byId = (rows: Rows) => ({
  pages: Object.fromEntries(rows.pages.map(r => [(r as { id: string }).id, r])),
  folders: Object.fromEntries(
    rows.folders.flatMap(r => {
      const f = r as { id: string; lineup: unknown[] }
      return f.id === UNREADABLE_ID && f.lineup.length === 0 ? [] : [[f.id, r]]
    }),
  ),
})

// ゴミ箱の行を足した行（ゴミ箱の並びは trashed の物）
function withTrash(rows: Rows, ...trashed: Rows["folders"]): Rows {
  return { ...rows, folders: [...rows.folders, { folderRole: "trash", id: TRASH_ID, lineup: trashed }] }
}

// 単位ごとの用意: 行と、欠けた機能台帳と、移る物の id と理由の番号
const CASES: { name: string; rows: () => Rows; less: CoreCatalog; moved: [string, string][] }[] = [
  {
    name: "ブックの中のページ",
    rows: () => worldRows([testBook("b1", "B", [drawingPage("p1"), md("m1"), drawingPage("p2", { title: "二" })])]),
    less: NO_MARKDOWN,
    moved: [["m1", "W027"]],
  },
  {
    name: "バインダの中のページ（タイプの在るバインダは残る）",
    rows: () =>
      worldRows([
        testBook("b1", "B", [drawingPage("p1"), testBinder("f1", "束", SLIDE, slide("s1", "一"), slide("s2", "二"))]),
      ]),
    less: without(SLIDE),
    moved: [["f1", "W027"]],
  },
  {
    name: "ブックの外のページ",
    rows: () => worldRows([], [drawingPage("x1", { title: "外" }), md("x2", "外 2")]),
    less: NO_MARKDOWN,
    moved: [["x2", "W027"]],
  },
  {
    name: "ブックの外のバインダ",
    rows: () => worldRows([], [testBinder("f1", "外の束", SLIDE, slide("s1"))]),
    less: NO_SLIDE,
    moved: [["f1", "W027"]],
  },
  {
    name: "タイプの無い空のバインダ（ブックは残る）",
    rows: () => worldRows([testBook("b1", "B", [drawingPage("p1"), testBinder("f1", "空", SLIDE)])]),
    less: NO_SLIDE,
    moved: [["f1", "W027"]],
  },
  {
    name: "ロックしたページ",
    rows: () => worldRows([testBook("b1", "B", [drawingPage("p1"), { ...md("m1"), locked: true } as never])]),
    less: NO_MARKDOWN,
    moved: [["m1", "W027"]],
  },
  {
    name: "ゴミ箱の中のブック",
    rows: () => {
      const base = worldRows([testBook("b1", "B"), testBook("b2", "捨てた", [md("m1")])])
      const home = folderOf(base, HOME_ID)
      return withTrash(
        { ...base, folders: base.folders.map(f => (f === home ? { ...home, lineup: [home.lineup[0]] } : f)) },
        { kind: "book", id: "b2", trashed: NOW, from: [HOME_ID] },
      )
    },
    less: NO_MARKDOWN,
    moved: [["m1", "W027"]],
  },
]

// 移したあとの書庫は、その機能台帳で読めない物を持たず、読めない物のフォルダの外の行を全部、表に読む
function readsWhole(catalog: CoreCatalog, moved: Rows) {
  const read = readLibrary(catalog, moved.pages, moved.folders)
  expect([...read.warnings, ...read.outsideWarnings].map(w => w.code)).toEqual([])
  const outside = outsideUnreadable(moved.pages, moved.folders)
  const ids = (rows: readonly unknown[]) => rows.map(r => (r as { id: string }).id).sort()
  expect(Object.keys(read.library.pages).sort()).toEqual(ids(outside.pageRows))
  expect(Object.keys(read.library.folders).sort()).toEqual(ids(outside.folderRows))
  // 移したあとは、表で見る木の決まりと、行で見る木の決まりが同じく守られる（書庫が対象のアクションは断られない）
  expect(treeHolds(read.library)).toBe(true)
  expect(rowsHoldTree(moved.folders, ids(moved.pages))).toBe(true)
}

// 行 rows のフォルダ id の行を f で替えた行
const withFolder = (rows: Rows, id: string, f: (row: Record<string, unknown>) => object): Rows => ({
  ...rows,
  folders: rows.folders.map(r => ((r as { id: string }).id === id ? f(r as Record<string, unknown>) : r)),
})
const connector = { id: "l", item: "@matomezu/line:connector-line", from: "a", to: "b", props: {} }

// 機能台帳がそろっていても読めない物の用意: 行と、移る物の id と理由の番号（直らない間は戻らない）
const STAYS: { name: string; rows: () => Rows; moved: [string, string][] }[] = [
  {
    name: "タイプの形に合わないページ",
    rows: () =>
      worldRows([
        testBook("b1", "B", [drawingPage("p1"), { ...drawingPage("p2", { title: "二" }), items: "x" } as never]),
      ]),
    moved: [["p2", "W028"]],
  },
  {
    name: "タイプの決まりを守らないページ（線の端が無い）",
    rows: () =>
      worldRows([
        testBook("b1", "B", [drawingPage("p1"), drawingPage("p2", { title: "二", items: [connector] } as never)]),
      ]),
    moved: [["p2", "W029"]],
  },
  {
    name: "形に合わないバインダ",
    rows: () =>
      withFolder(
        worldRows([testBook("b1", "B", [drawingPage("p1"), testBinder("f1", "束", SLIDE, slide("s1"))])]),
        "f1",
        r => ({
          ...r,
          pageType: 5,
        }),
      ),
    moved: [["f1", "W028"]],
  },
  {
    name: "紙と向きのそろわないバインダ（ブックの外）",
    rows: () =>
      worldRows(
        [],
        [testBinder("f1", "束", SLIDE, slide("s1", "一"), { ...slide("s2", "二"), orientation: "portrait" } as never)],
      ),
    moved: [["f1", "W029"]],
  },
  {
    name: "紙と向きのそろわないバインダ（ブックの中。ブックは残る）",
    rows: () =>
      worldRows([
        testBook("b1", "B", [
          drawingPage("p1"),
          testBinder("f1", "束", SLIDE, slide("s1", "一"), { ...slide("s2", "二"), orientation: "portrait" } as never),
        ]),
      ]),
    moved: [["f1", "W029"]],
  },
  {
    name: "読めないページを持ち、ブック自体も形に合わないブック（ブックごと）",
    rows: () =>
      withFolder(
        worldRows([
          testBook("b1", "B", [drawingPage("p1"), { ...drawingPage("p2", { title: "二" }), items: "x" } as never]),
        ]),
        "b1",
        r => ({ ...r, title: 5 }),
      ),
    moved: [["b1", "W005"]],
  },
]

// 読めるかの判定が 1 つである事: 確かめる関数 checkBooks（画面と同じ読み方）がブックに出す訳の番号は、移す側 unreadableUnitsOf が、
// そのブックごとか、その中から移す最初の物の番号と同じ（移す物の無いブックには、どちらも出さない）。ブックの外の物も、readLibrary の外の warning の番号と、
// 移す側がブックの外から移す物の番号がそろう
function agrees(catalog: CoreCatalog, rows: Rows) {
  const folders = Object.fromEntries(rows.folders.map(f => [(f as { id: string }).id, f])) as Folders
  const bookOf = (id: string): string | undefined =>
    folders[id]?.folderRole === "book" ? id : foldersOver(folders, id).find(f => f.folderRole === "book")?.id
  const fromUnits = new Map<string, string>()
  const outside = new Set<string>()
  for (const u of unreadableUnitsOf(catalog, rows.pages, rows.folders)) {
    const book = bookOf(u.element.id)
    if (book === undefined) outside.add(u.code)
    else if (!fromUnits.has(book)) fromUnits.set(book, u.code)
  }
  const fromCheck = new Map<string, string>(
    checkBooks(catalog, rawBooksOf(rows.pages, rows.folders)).warnings.map(w => [w.params.book ?? "", w.code]),
  )
  expect(fromCheck).toEqual(fromUnits)
  const read = readLibrary(catalog, rows.pages, rows.folders)
  expect(new Set<string>(read.outsideWarnings.map(w => w.code).filter(c => c !== "W007"))).toEqual(outside)
}

describe("確かめる関数と移す側は、ブックに同じ訳の番号を出す", () => {
  for (const c of CASES) test(c.name, () => agrees(c.less, c.rows()))
  for (const c of STAYS) test(c.name, () => agrees(CORE_CATALOG, c.rows()))
})

describe("機能台帳がそろっていても読めない物は移り、移したあとの書庫は読めない物のフォルダの外の行を全部読む。もう 1 回行っても変わらない", () => {
  for (const c of STAYS)
    test(c.name, () => {
      const moved = settled(CORE_CATALOG, c.rows())
      expect(unreadableOf(moved).lineup.map(r => [r.entry.id, r.code])).toEqual(c.moved)
      readsWhole(CORE_CATALOG, moved)
      const again = settle(CORE_CATALOG, moved, LATER) as Settled
      expect(again.writes).toEqual({ pages: {}, folders: {}, removedPages: [], removedFolders: [] })
    })
})

describe("単位ごとに、欠けた機能台帳で移り、もう 1 回行っても変わらず、元の機能台帳で戻すと行が全部元どおり", () => {
  for (const c of CASES)
    test(c.name, () => {
      const rows = c.rows()
      const moved = settled(c.less, rows)
      expect(unreadableOf(moved).lineup.map(r => [r.entry.id, r.code])).toEqual(c.moved)
      expect(
        rowsHoldTree(
          moved.folders,
          moved.pages.map(p => (p as { id: string }).id),
        ),
      ).toBe(true)
      readsWhole(c.less, moved)
      const again = settle(c.less, moved, LATER) as Settled
      expect(again.writes).toEqual({ pages: {}, folders: {}, removedPages: [], removedFolders: [] })
      const back = settled(CORE_CATALOG, moved, LATER)
      expect(byId(back)).toEqual(byId(rows))
      expect(unreadableOf(back).lineup).toEqual([])
    })
})

test("ブックの形に合わないブック（W005）はブックごと移り、中の読めないページは別に数えない。機能台帳が戻っても、形に合わない間は戻らない", () => {
  const plain = worldRows([testBook("b1", "B", [md("m1"), drawingPage("p1")])])
  const rows = {
    ...plain,
    folders: plain.folders.map(f => ((f as { id: string }).id === "b1" ? { ...(f as object), locked: "yes" } : f)),
  }
  const moved = settled(NO_MARKDOWN, rows)
  expect(unreadableOf(moved).lineup.map(r => [r.entry.id, r.code])).toEqual([["b1", "W005"]])
  expect(folderOf(moved, "b1").lineup.map(r => r.id)).toEqual(["m1", "p1"])
  expect((settle(CORE_CATALOG, moved, LATER) as Settled).writes.folders).toEqual({})
})

test("移した物は、在った所の並びのエントリ・在ったフォルダから上への列・直前の物・理由・無いタイプ・移した時刻を持ち、行の中身は変わらない", () => {
  const rows = worldRows([testBook("b1", "B", [md("m0"), drawingPage("p1"), md("m1")])])
  const done = settle(NO_MARKDOWN, rows) as Settled
  expect(Object.keys(done.writes.pages)).toEqual([])
  const moved = applied(rows, done)
  expect(unreadableOf(moved).lineup).toEqual([
    {
      entry: { kind: "page", id: "m0" },
      from: ["b1", HOME_ID],
      after: FIRST,
      code: "W027",
      type: MARKDOWN,
      moved: NOW,
    },
    { entry: { kind: "page", id: "m1" }, from: ["b1", HOME_ID], after: "p1", code: "W027", type: MARKDOWN, moved: NOW },
  ])
  expect(folderOf(moved, "b1").lineup).toEqual([{ kind: "page", id: "p1" }])
})

test("並んでいた物がまとめて移っても、戻すと元の並びに戻る（直前の物が読めない物のフォルダの中なら、その直前をたどる）", () => {
  const rows = worldRows([
    testBook("b1", "B", [drawingPage("p1"), md("m1"), md("m2"), drawingPage("p2", { title: "二" })]),
  ])
  const moved = settled(NO_MARKDOWN, rows)
  // m1 が戻らないまま m2 だけが戻る所: m1 を読めない形にしておく
  const unreadable = unreadableOf(moved)
  const broken = {
    ...moved,
    pages: moved.pages.map(p => ((p as { id: string }).id === "m1" ? { ...(p as object), type: "@foo/x:y" } : p)),
  }
  const back = settled(CORE_CATALOG, broken, LATER)
  expect(folderOf(back, "b1").lineup.map(r => r.id)).toEqual(["p1", "m2", "p2"])
  expect(unreadableOf(back).lineup.map(r => r.entry.id)).toEqual(["m1"])
  expect(unreadable.lineup.length).toBe(2)
})

test("入れ物が先に戻り、中の物は次の回で戻る（ブックとその中のページが別々に移った所）", () => {
  // 先に m1 だけが移り、あとでブックが形に合わなくなって移る
  const rows = worldRows([testBook("b1", "B", [drawingPage("p1"), md("m1")])])
  const first = settled(NO_MARKDOWN, rows)
  const bad = {
    ...first,
    folders: first.folders.map(f => ((f as { id: string }).id === "b1" ? { ...(f as object), title: 5 } : f)),
  }
  const both = settled(NO_MARKDOWN, bad, LATER)
  expect(unreadableOf(both).lineup.map(r => [r.entry.id, r.code])).toEqual([
    ["m1", "W027"],
    ["b1", "W005"],
  ])
  const fixed = {
    ...both,
    folders: both.folders.map(f => ((f as { id: string }).id === "b1" ? { ...(f as object), title: "B" } : f)),
  }
  const back = settled(CORE_CATALOG, fixed, LATER)
  expect(byId(back)).toEqual(byId(rows))
})

test("在ったフォルダが無ければ、その上のまだ在るフォルダへ、それも無ければ書庫ホームへ戻る。名前が重なれば番号を付ける（ロック中でも）", () => {
  const rows = worldRows([], [{ ...md("x1", "メモ"), locked: true } as never])
  const moved = settled(NO_MARKDOWN, rows)
  // 移っている間に、同じ名前のページが書庫ホームに増えた
  const crowded = {
    pages: [...moved.pages, drawingPage("x2", { title: "メモ" })],
    folders: moved.folders.map(f =>
      (f as { id: string }).id === HOME_ID
        ? { ...(f as object), lineup: [...(f as { lineup: object[] }).lineup, { kind: "page", id: "x2" }] }
        : f,
    ),
  }
  expect((settle(CORE_CATALOG, crowded, LATER) as Settled).numbered).toEqual([{ id: "x1", title: "メモ 2" }])
  const back = settled(CORE_CATALOG, crowded, LATER)
  expect(folderOf(back, HOME_ID).lineup.map(r => r.id)).toEqual(["x1", "x2"])
  expect(back.pages.find(p => (p as { id: string }).id === "x1")).toEqual({ ...md("x1", "メモ 2"), locked: true })
})

test("在ったフォルダが無くなっていれば、その上のまだ在るフォルダの末尾へ戻る", () => {
  const rows = worldRows([], [md("x1", "メモ")])
  const home = folderOf(rows, HOME_ID)
  const inFolder: Rows = {
    pages: rows.pages,
    folders: [
      ...rows.folders.map(f => (f === home ? { ...home, lineup: [{ kind: "folder", id: "d1" }] } : f)),
      { folderRole: "folder", id: "d1", title: "外側", lineup: [{ kind: "folder", id: "d2" }] },
      { folderRole: "folder", id: "d2", title: "奥", lineup: [{ kind: "page", id: "x1" }] },
    ],
  }
  const moved = settled(NO_MARKDOWN, inFolder)
  expect(unreadableOf(moved).lineup[0]?.from).toEqual(["d2", "d1", HOME_ID])
  const gone: Rows = {
    pages: moved.pages,
    folders: moved.folders.flatMap(f => {
      const id = (f as { id: string }).id
      if (id === "d2") return []
      return [id === "d1" ? { ...(f as object), lineup: [] } : f]
    }),
  }
  const back = settled(CORE_CATALOG, gone, LATER)
  expect(folderOf(back, "d1").lineup).toEqual([{ kind: "page", id: "x1" }])
})

test("ゴミ箱に居た物は、ゴミ箱に居た事（入れた時刻と元の列）を覚えて移り、ゴミ箱へ元どおりに戻る", () => {
  const base = worldRows([testBook("b1", "B")], [md("x1")])
  const home = folderOf(base, HOME_ID)
  const rows = withTrash(
    { ...base, folders: base.folders.map(f => (f === home ? { ...home, lineup: [home.lineup[0]] } : f)) },
    { kind: "page", id: "x1", trashed: NOW, from: ["gone", HOME_ID] },
  )
  const moved = settled(NO_MARKDOWN, rows)
  expect(unreadableOf(moved).lineup[0]?.entry).toEqual({
    kind: "page",
    id: "x1",
    trashed: NOW,
    from: ["gone", HOME_ID],
  })
  expect(unreadableOf(moved).lineup[0]?.from).toEqual([TRASH_ID])
  expect(byId(settled(CORE_CATALOG, moved, LATER))).toEqual(byId(rows))
})

test("先のブックと id が重なるブック（W006）は、ブックごと移り、相手のブックが在る間は戻らない（書庫ホームへも）。完全に消しても、ほかのブックと分け合うページの行は消さない", () => {
  const shared = drawingPage("p1")
  const rows = worldRows([
    testBook("b1", "B", [shared]),
    testBook("b2", "C", [shared, drawingPage("p2", { title: "二" })]),
  ])
  const moved = settled(CORE_CATALOG, rows)
  expect(unreadableOf(moved).lineup.map(r => [r.entry.id, r.code])).toEqual([["b2", "W006"]])
  readsWhole(CORE_CATALOG, moved)
  const again = settle(CORE_CATALOG, moved, LATER) as Settled
  expect(again.returned).toEqual([])
  expect(again.writes).toEqual({ pages: {}, folders: {}, removedPages: [], removedFolders: [] })
  const purge = purgedRows(moved.pages, moved.folders, "b2")
  expect(purge?.removedFolders).toEqual(["b2"])
  expect(purge?.removedPages).toEqual(["p2"])
  expect(purgedRows(moved.pages, moved.folders, "b1")).toBeUndefined()
  const gone = applied(moved, { writes: purge!, moved: [], returned: [], numbered: [] })
  expect(
    rowsHoldTree(
      gone.folders,
      gone.pages.map(p => (p as { id: string }).id),
    ),
  ).toBe(true)
})

test("移したあとの行を id の順に並べて画面と同じ読み方（rawBooksOf と checkBooks）で読んでも、読めない物のフォルダに移したブックは読めず、書庫に残ったブックが読める", () => {
  const shared = drawingPage("p1")
  const rows = worldRows([testBook("z1", "B", [shared]), testBook("a1", "C", [shared])])
  const moved = settled(CORE_CATALOG, rows)
  expect(unreadableOf(moved).lineup.map(r => [r.entry.id, r.code])).toEqual([["a1", "W006"]])
  const idOf = (r: unknown) => (r as { id: string }).id
  const sorted = [...moved.folders].sort((a, b) => idOf(a).localeCompare(idOf(b)))
  const read = checkBooks(CORE_CATALOG, rawBooksOf(moved.pages, sorted))
  expect(read.books.map(b => b.id)).toEqual(["z1"])
  expect(read.warnings).toEqual([])
})

test("木の決まりを破る物（行の無いページを持つブック・2 度持たれたページ）と、どこにも持たれていない行は移さない", () => {
  const rows = worldRows([testBook("b1", "B", [drawingPage("p1"), md("m1")])], [md("x1")])
  const home = folderOf(rows, HOME_ID)
  const broken: Rows = {
    pages: [...rows.pages.filter(p => (p as { id: string }).id !== "p1"), md("orphan")],
    folders: rows.folders.map(f =>
      f === home ? { ...home, lineup: [...home.lineup, { kind: "page", id: "x1" }] } : f,
    ),
  }
  expect(unreadableUnitsOf(NO_MARKDOWN, broken.pages, broken.folders)).toEqual([])
  // 行の無いページを持つブックは、読めないページ（W027）でなく、ブックの形に合わない（W005）として読む
  const read = checkBooks(CORE_CATALOG, rawBooksOf(broken.pages, broken.folders))
  expect(read.warnings.map(w => [w.code, w.params.book])).toEqual([["W005", "b1"]])
})

test("読めない物のフォルダの行が形に合わなければ、何も書かない", () => {
  const rows = worldRows([testBook("b1", "B", [md("m1")])])
  const bad = { ...rows, folders: [...rows.folders, { folderRole: "unreadable", id: UNREADABLE_ID, lineup: [1] }] }
  expect(settle(NO_MARKDOWN, bad)).toBe(BROKEN)
})

test("読める物だけなら、何も書かない", () => {
  const rows = worldRows(
    [testBook("b1", "B", [drawingPage("p1"), md("m1")])],
    [testPage(DRAWING, "x1", { title: "外" })],
  )
  expect((settle(CORE_CATALOG, rows) as Settled).writes).toEqual({
    pages: {},
    folders: {},
    removedPages: [],
    removedFolders: [],
  })
})

test("書庫から外した物と、読めない物のフォルダの直下の物は同じ走りで決まる: 形に合う要素はその並びの要素と行を、形に合わない要素も BROKEN として挙げる", () => {
  const moved = settled(NO_MARKDOWN, worldRows([testBook("b1", "B", [md("m1"), drawingPage("p1")])], [md("x1", "外")]))
  const folder = (moved.folders as { id: string; lineup?: unknown[] }[]).find(f => f.id === UNREADABLE_ID)
  // 形に合わない要素のブック b1（書庫ホームからは外す）と、書庫ホームも持つ外のページ x2（書庫に残るので挙げない）
  const loose = {
    pages: [...moved.pages, md("x2")],
    folders: moved.folders.map(f => {
      const row = f as { id: string; lineup?: unknown[] }
      if (f === folder)
        return {
          ...folder,
          lineup: [
            ...(folder?.lineup ?? []),
            { entry: { kind: "book", id: "b1" } },
            { entry: { kind: "page", id: "x2" } },
          ],
        }
      if (row.id === HOME_ID)
        return {
          ...row,
          lineup: [...(row.lineup ?? []).filter(e => (e as { id: string }).id !== "b1"), { kind: "page", id: "x2" }],
        }
      return f
    }),
  }
  const out = outsideUnreadable(loose.pages, loose.folders)
  expect(out.unreadable.map(u => [u.id, u.ref === BROKEN ? BROKEN : u.ref.code])).toEqual([
    ["x1", "W027"],
    ["m1", "W027"],
    ["b1", BROKEN],
  ])
  expect(out.unreadable.map(u => (u.row as { title?: string } | undefined)?.title)).toEqual(["外", "m1", "B"])
  const kept = new Set([...out.pageRows, ...out.folderRows].map(r => (r as { id: string }).id))
  for (const u of out.unreadable) expect(kept.has(u.id)).toBe(false)
  expect(kept.has("x2")).toBe(true)
  expect(outsideUnreadable(loose.pages, loose.folders)).toBe(out)
})
