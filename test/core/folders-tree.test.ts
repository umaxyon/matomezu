// 書庫の木: 書庫ホームとフォルダと、木の決まり、ブックを足す・消すときの置き場所の書き込み

import { describe, expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { keepsPageTypesAcross } from "../../web/src/core/book"
import { trashedEntry } from "../../web/src/core/entries"
import {
  bookIdOf,
  bookOf,
  type Folder,
  foldersOver,
  HOME_ID,
  homeAndFoldersOf,
  homeOver,
  type Library,
  libraryOf,
  NO_CHANGES,
  type PlainFolder,
  placedChanges,
  rawBooksOf,
  restoredTables,
  rowChanges,
  rowsHoldTree as rowsHold,
  TRASH_ID,
  type TrashFolder,
  treeHolds,
  withBook,
  withChanges,
  withoutBook,
  worldTablesOf,
} from "../../web/src/core/folders"
import { performIn, type World } from "../../web/src/core/perform"
import { REMOVED } from "../../web/src/core/records"
import type { Book } from "../../web/src/core/schema/book"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { drawingPage, MARKDOWN, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, sequence } from "../support"

const b1 = testBook("b1", "一", [drawingPage("p1"), testBinder("f1", "束", SLIDE, testPage(SLIDE, "s1"))])
const b2 = testBook("b2", "二", [drawingPage("p2")])
// 書庫ホーム > フォルダ old（b1・b2）
const old: PlainFolder = {
  folderRole: "folder",
  id: "old",
  title: "旧ブック",
  lineup: [
    { kind: "book", id: "b1" },
    { kind: "book", id: "b2" },
  ],
}
const home = { folderRole: "home", id: HOME_ID, lineup: [{ kind: "folder", id: "old" }] } as const
const tables = (): Library => worldTablesOf([b1, b2], [home, old])
const withFolders = (t: Library, ...folders: Folder[]): Library => ({
  pages: t.pages,
  folders: { ...t.folders, ...Object.fromEntries(folders.map(f => [f.id, f])) },
})

describe("書庫ホームとフォルダ", () => {
  test("置き場所の行から、書庫ホームとフォルダだけを形を確かめて取り出す（形に合わない行・ブック・バインダは入らない）", () => {
    const holdsPage = { folderRole: "folder", id: "y", title: "ページ入り", lineup: [{ kind: "page", id: "p1" }] }
    expect(homeAndFoldersOf([holdsPage])).toEqual([holdsPage as PlainFolder])
    const rows = [
      home,
      old,
      { folderRole: "folder", id: "x", lineup: [] },
      { folderRole: "folder", id: "z", title: "知らない種類", lineup: [{ kind: "scrap", id: "p1" }] },
      { folderRole: "home", id: "other", lineup: [] },
      { folderRole: "book", id: "b9", title: "九", lineup: [] },
      { folderRole: "binder", id: "f9", title: "束", pageType: SLIDE, lineup: [] },
      null,
    ]
    expect(homeAndFoldersOf(rows)).toEqual([home, old])
  })

  test("ブックにするのは、役が書庫ホーム・フォルダ・バインダでないフォルダ（フォルダに入っていてもブック。役の無い行は、そのまま 1 冊として返す）", () => {
    const t = tables()
    const broken = { id: "bx", title: 1 }
    const raw = rawBooksOf(Object.values(t.pages), [...Object.values(t.folders), broken])
    expect(raw.map(b => (b as { id: string }).id)).toEqual(["b1", "b2", "bx"])
    expect(raw[0]).toEqual(b1)
    expect(raw[2]).toEqual(broken)
  })

  test("ページを入れているフォルダの列は、書庫ホームまで続く。持っているブックは、途中のブック", () => {
    const t = tables()
    expect(foldersOver(t.folders, "s1").map(f => f.id)).toEqual(["f1", "b1", "old", HOME_ID])
    expect(bookIdOf(t.folders, "s1")).toBe("b1")
    // 輪になっていても止まる
    const loop = withFolders(t, { ...old, lineup: [...old.lineup, { kind: "folder", id: HOME_ID }] })
    expect(foldersOver(loop.folders, "p1").length).toBe(3)
  })

  test("ブックの一覧は、フォルダの中のブックも組む", () => {
    expect(Object.keys(libraryOf(tables()))).toEqual(["b1", "b2"])
  })
})

describe("木の決まり", () => {
  test("書庫ホームから全部のフォルダへたどれる世界は守っている。ブックだけを直下に置いた書庫ホームも", () => {
    expect(treeHolds(tables())).toBe(true)
    expect(treeHolds(worldTablesOf([b1, b2], [homeOver([b1, b2])]))).toBe(true)
    expect(treeHolds(worldTablesOf([], [homeOver([])]))).toBe(true)
  })

  test("書庫ホームが無い・どこにも入っていないブックがある・同じエントリが 2 つのフォルダに在る・輪になる・書庫ホームがフォルダに入る、は破っている", () => {
    expect(treeHolds(worldTablesOf([b1, b2], [old]))).toBe(false)
    expect(treeHolds(worldTablesOf([b1, b2], [homeOver([b1])]))).toBe(false)
    const twice: PlainFolder = { folderRole: "folder", id: "y", title: "別", lineup: [{ kind: "book", id: "b1" }] }
    expect(
      treeHolds(withFolders(tables(), twice, { ...home, lineup: [...home.lineup, { kind: "folder", id: "y" }] })),
    ).toBe(false)
    const a: PlainFolder = { folderRole: "folder", id: "a", title: "a", lineup: [{ kind: "folder", id: "c" }] }
    const c: PlainFolder = { folderRole: "folder", id: "c", title: "c", lineup: [{ kind: "folder", id: "a" }] }
    expect(treeHolds(withFolders(tables(), a, c))).toBe(false)
    expect(treeHolds(withFolders(tables(), { ...old, lineup: [...old.lineup, { kind: "folder", id: HOME_ID }] }))).toBe(
      false,
    )
  })

  test("書庫ホームとフォルダのエントリは、ブックかフォルダで、種類が合う（表に無い book も破れる。読めないブックは表に入らない）", () => {
    const t = tables()
    expect(treeHolds(withFolders(t, { ...old, lineup: [...old.lineup, { kind: "book", id: "unread" }] }))).toBe(false)
    expect(treeHolds(withFolders(t, { ...old, lineup: [...old.lineup, { kind: "folder", id: "none" }] }))).toBe(false)
    expect(treeHolds(withFolders(t, { ...old, lineup: [{ kind: "folder", id: "b1" }, old.lineup[1]!] }))).toBe(false)
  })

  test("書庫ホームとフォルダは、ページとバインダも持てる（表に無いページ・バインダでない物を binder で指すと破れる）", () => {
    const loose = drawingPage("q1")
    const slide = testPage(SLIDE, "s9")
    const binder: Folder = {
      folderRole: "binder",
      id: "f9",
      title: "外の束",
      pageType: SLIDE,
      lineup: [{ kind: "page", id: "s9" }],
    }
    const holding: PlainFolder = {
      ...old,
      lineup: [...old.lineup, { kind: "page", id: "q1" }, { kind: "binder", id: "f9" }],
    }
    const t = withFolders(tables(), holding, binder)
    const world: Library = { pages: { ...t.pages, q1: loose, s9: slide }, folders: t.folders }
    expect(treeHolds(world)).toBe(true)
    expect(foldersOver(world.folders, "s9").map(f => f.id)).toEqual(["f9", "old", HOME_ID])
    expect(bookIdOf(world.folders, "s9")).toBeUndefined()
    // ページの行が無い
    expect(treeHolds({ pages: { ...t.pages, s9: slide }, folders: t.folders })).toBe(false)
    // binder で指した先がブック
    expect(treeHolds(withFolders(tables(), { ...old, lineup: [{ kind: "binder", id: "b1" }, old.lineup[1]!] }))).toBe(
      false,
    )
    // 置き直しても、ブックの外のページとバインダは残り、中身の無いエントリだけが外れる
    const without = (id: string) => ({
      fields: { lineup: { set: holding.lineup.filter(r => r.id !== id), was: holding.lineup } },
    })
    // 片付けが、置き直す値の挙げていない行（入れていた並び）に及ぶなら断る
    expect(restoredTables(world, { pages: { q1: { absent: true, was: loose } }, folders: {} })).toBeNull()
    const restored = restoredTables(world, {
      pages: { q1: { absent: true, was: loose } },
      folders: { old: without("q1") },
    }) as Library
    expect(restored.folders.old?.lineup).toEqual([...old.lineup, { kind: "binder", id: "f9" }])
    expect(Object.keys(restored.pages)).toContain("s9")
    expect(treeHolds(restored)).toBe(true)
    expect(restoredTables(world, { pages: {}, folders: { f9: { absent: true, was: binder } } })).toBeNull()
    const gone = restoredTables(world, {
      pages: { s9: { absent: true, was: slide } },
      folders: { f9: { absent: true, was: binder }, old: without("f9") },
    }) as Library
    expect(gone.folders.old?.lineup).toEqual([...old.lineup, { kind: "page", id: "q1" }])
    expect(Object.keys(gone.pages)).not.toContain("s9")
  })

  test("ゴミ箱: 行から形を確かめて取り出し、ブックにはしない。ゴミ箱に着く物も木に入り、ゴミ箱がフォルダに入る・形が合わないと破れる。置き直してもゴミ箱の並びは残る", () => {
    // b2 をゴミ箱に入れた世界
    const trash: TrashFolder = {
      folderRole: "trash",
      id: TRASH_ID,
      lineup: [{ kind: "book", id: "b2", trashed: "2026-11-18T00:00:00.000Z", from: ["old", HOME_ID] }],
    }
    const kept: PlainFolder = { ...old, lineup: [old.lineup[0]!] }
    const t = withFolders(tables(), kept, trash)
    expect(homeAndFoldersOf([trash, { folderRole: "trash", id: "other", lineup: [] }])).toEqual([trash])
    expect(homeAndFoldersOf([{ ...trash, lineup: [{ kind: "book", id: "b2" }] }])).toEqual([])
    expect(rawBooksOf(Object.values(t.pages), Object.values(t.folders)).map(b => (b as { id: string }).id)).toEqual([
      "b1",
      "b2",
    ])
    expect(treeHolds(t)).toBe(true)
    expect(rowsHold(Object.values(t.folders), Object.keys(t.pages))).toBe(true)
    expect(foldersOver(t.folders, "p2").map(f => f.id)).toEqual(["b2", TRASH_ID])
    expect(treeHolds(withFolders(t, { ...kept, lineup: [...kept.lineup, { kind: "folder", id: TRASH_ID }] }))).toBe(
      false,
    )
    const b1Lineup = (t.folders.b1 as Folder).lineup
    const restored = restoredTables(t, {
      pages: { p1: { absent: true, was: t.pages.p1 } },
      folders: { b1: { fields: { lineup: { set: b1Lineup.filter(r => r.id !== "p1"), was: b1Lineup } } } },
    }) as Library
    expect(restored.folders[TRASH_ID]).toBe(trash)
    // 完全に消したブックは、ゴミ箱の並びからも外れる
    const purged = placedChanges(t, { pages: { p2: REMOVED }, folders: { b2: REMOVED } })
    expect(withChanges(t, purged).folders[TRASH_ID]?.lineup).toEqual([])
    expect(treeHolds(withChanges(t, purged))).toBe(true)
  })

  test("置き場所の行のまま確かめる: 読めないブックの行も木に入り、どこにも入っていないブックとページ・形に合わないフォルダの行・書庫ホームが無いと破れる", () => {
    const rows = Object.values(tables().folders) as unknown[]
    const ids = Object.keys(tables().pages)
    const rowsHoldTree = (given: readonly unknown[], pages: readonly string[] = ids) => rowsHold(given, pages)
    expect(rowsHoldTree(rows)).toBe(true)
    // どのフォルダにも入っていないページの行
    expect(rowsHoldTree(rows, [...ids, "stray"])).toBe(false)
    // 役の無い行は、読めないブックとして木に入る
    const broken = { id: "odd", lineup: "none" }
    expect(rowsHoldTree([...rows, broken])).toBe(false)
    const holding: PlainFolder = { ...old, lineup: [...old.lineup, { kind: "book", id: "odd" }] }
    expect(rowsHoldTree([...Object.values(withFolders(tables(), holding).folders), broken])).toBe(true)
    expect(rowsHoldTree(rows.map(r => ((r as Folder).id === "old" ? { ...old, title: 3 } : r)))).toBe(false)
    expect(rowsHoldTree(rows.filter(r => (r as Folder).id !== HOME_ID))).toBe(false)
  })
})

describe("ブックの値を書庫に置く・外す", () => {
  test("置き換えると、ブックに無くなったバインダとページは外れ、変わらない行は前の値のまま。ほかのブックと、入れているフォルダの並びは変わらない", () => {
    const t = tables()
    const kept = bookOf(t, "b1")!
    expect(withBook(t, kept).pages.p1).toBe(t.pages.p1)
    expect(rowChanges(t, withBook(t, kept))).toEqual(NO_CHANGES)
    const next = withBook(t, { ...kept, title: "改名", lineup: [kept.lineup[0]!] })
    expect(bookOf(next, "b1")).toEqual({ ...kept, title: "改名", lineup: [kept.lineup[0]!] })
    expect(Object.keys(rowChanges(t, next).pages)).toEqual(["s1"])
    expect(Object.keys(rowChanges(t, next).folders).sort()).toEqual(["b1", "f1"])
    expect(next.folders.old).toBe(t.folders.old)
    expect(treeHolds(next)).toBe(true)
  })

  test("1 冊を置き換えても、ほかのブックは、書庫から組むと前と同じ値（perform が、変わったブックだけを確かめるのに頼る）", () => {
    const t = tables()
    const next = withBook(t, { ...bookOf(t, "b1")!, title: "改名" })
    expect(libraryOf(next).old).toBe(libraryOf(t).old)
    expect(libraryOf(next).b1).not.toBe(libraryOf(t).b1)
  })

  test("新しいブックは、行が足されるだけで、どのフォルダの並びにも入らない。外すと、ブックと中のバインダとページの行が無くなる", () => {
    const t = tables()
    const b3 = testBook("b3", "三", [drawingPage("p3")])
    const added = withBook(t, b3)
    expect(bookOf(added, "b3")).toEqual(b3)
    expect(added.folders.old).toBe(t.folders.old)
    const gone = withoutBook(t, "b1")
    expect(Object.keys(rowChanges(t, gone).pages).sort()).toEqual(["p1", "s1"])
    expect(rowChanges(t, gone).folders).toEqual({ b1: REMOVED, f1: REMOVED })
    expect(withoutBook(t, "old")).toBe(t)
    expect(withoutBook(t, "none")).toBe(t)
  })
})

describe("表の変わり", () => {
  test("変わった・足した・無くなった行だけを出す。作り直しただけで中身が同じ行は、変わりにしない", () => {
    const t = tables()
    expect(rowChanges(t, t)).toEqual(NO_CHANGES)
    const renamed: PlainFolder = { ...old, title: "新しい名前" }
    const rebuilt = { ...home, lineup: [...home.lineup] }
    const next: Library = {
      pages: Object.fromEntries(Object.entries(t.pages).filter(([id]) => id !== "p2")),
      folders: {
        ...t.folders,
        old: renamed,
        [HOME_ID]: rebuilt,
        y: { folderRole: "folder", id: "y", title: "y", lineup: [] },
      },
    }
    expect(rowChanges(t, next)).toEqual({
      pages: { p2: REMOVED },
      folders: { old: renamed, y: { folderRole: "folder", id: "y", title: "y", lineup: [] } },
    })
  })
})

describe("ブックを足す・消すときの置き場所", () => {
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "en" as const,
    newId: sequence("n"),
    now: "2026-01-01T00:00:00.000Z",
    actor: USER,
  }
  const worldOf = (t: Library): World => ({ ...t, settings: {}, annotations: {}, records: {}, counters: {} })

  test("何も足さず消さない変わりは、そのまま返す", () => {
    expect(placedChanges(tables(), NO_CHANGES)).toBe(NO_CHANGES)
  })

  test("作ったブックは書庫ホームの末尾に入り、木の決まりを守る", () => {
    const world = worldOf(tables())
    const done = performIn(world, "@matomezu/base:book-create", { title: "新" }, undefined, ctx as never)
    expect(done.ok).toBe(true)
    if (!done.ok || !done.changes) throw new Error("no changes")
    const id = (done.result as { book: string }).book
    expect(done.changes.folders[HOME_ID]).toEqual({
      ...home,
      lineup: [
        { kind: "folder", id: "old" },
        { kind: "book", id },
      ],
    })
    const after = withChanges(world, done.changes)
    expect(treeHolds(after)).toBe(true)
    expect(Object.keys(libraryOf(after))).toContain(id)
  })

  test("完全に消したブックは、ゴミ箱の並びから外れる", () => {
    const binned = trashedEntry(worldTablesOf([b1, b2], [home, old]), "b2", "2026-01-01T00:00:00.000Z")
    const world = worldOf(binned as Library)
    const done = performIn(world, "@matomezu/base:entry-purge", { entries: ["b2"] }, undefined, ctx as never)
    expect(done.ok).toBe(true)
    if (!done.ok || !done.changes) throw new Error("no changes")
    expect(done.changes.folders.b2).toBe(REMOVED)
    expect(done.changes.folders[TRASH_ID]).toEqual({ folderRole: "trash", id: TRASH_ID, lineup: [] })
    expect(HOME_ID in done.changes.folders || "old" in done.changes.folders).toBe(false)
    expect(treeHolds(withChanges(world, done.changes))).toBe(true)
  })

  test("書庫ホームの無い世界では、ブックを作れない", () => {
    const world = worldOf(worldTablesOf([b1, b2], []))
    const done = performIn(world, "@matomezu/base:book-create", { title: "新" }, undefined, ctx as never)
    expect(done).toEqual({ ok: false, reason: "refused" })
  })
})

describe("置き直し（元に戻す）", () => {
  test("無かった行を丸ごと置く値は、違う中身の行が今在れば断る（その間の変更を、行ごと消さない）。同じ中身の行が在れば済んでいるとして飛ばす。行が無ければ置く", () => {
    const t = tables()
    const row = t.folders.b2 as Folder
    const locked = withFolders(t, { ...row, locked: true } as Folder)
    expect(restoredTables(locked, { pages: {}, folders: { b2: { set: row } } })).toBeNull()
    const page = t.pages.p2!
    expect(restoredTables(t, { pages: { p2: { set: { ...page, title: "別" } } }, folders: {} })).toBeNull()
    expect(restoredTables(t, { pages: { p2: { set: page } }, folders: {} })).toBe(t)
    // 同じ中身の行が、置き直す並びとは別の所に在れば、2 か所に置かずに断る
    const b1 = t.folders.b1 as Folder
    expect(
      restoredTables(t, {
        pages: { p2: { set: page } },
        folders: {
          b1: {
            fields: {
              lineup: { list: [{ id: "p2", index: b1.lineup.length, patch: { set: { kind: "page", id: "p2" } } }] },
            },
          },
        },
      }),
    ).toBeNull()
    // 行が無ければ置く（入れ先の並びも一緒に置き直す）
    const gone = restoredTables(t, {
      pages: { p2: { absent: true, was: page } },
      folders: { b2: { absent: true, was: row } },
    }) as Library
    expect(gone.folders.b2).toBeUndefined()
    const back = restoredTables(gone, {
      pages: { p2: { set: page } },
      folders: { b2: { set: row }, old: { fields: { lineup: { set: old.lineup } } } },
    }) as Library
    expect(back.folders.b2).toEqual(row)
    expect(back.pages.p2).toEqual(page)
  })

  test("置き直しても中身が何も変わらなければ、同じ表を返す", () => {
    const t = tables()
    // 無い行を無くす・表に中身の無いエントリを並びに足す（足した所は落ちる）
    expect(restoredTables(t, { pages: { nope: { absent: true, was: {} } }, folders: {} })).toBe(t)
    const lineup = [...(t.folders.b2 as Folder).lineup, { kind: "page" as const, id: "nope" }]
    expect(
      restoredTables(t, {
        pages: {},
        folders: { b2: { fields: { lineup: { set: lineup, was: (t.folders.b2 as Folder).lineup } } } },
      }),
    ).toBe(t)
  })

  test("ブックのページを置き直しても、書庫ホームとフォルダは残る", () => {
    const t = tables()
    const b2Lineup = (t.folders.b2 as Folder).lineup
    const next = restoredTables(t, {
      pages: { p2: { absent: true, was: t.pages.p2 } },
      folders: { b2: { fields: { lineup: { set: b2Lineup.filter(r => r.id !== "p2"), was: b2Lineup } } } },
    }) as Library
    expect(next.folders[HOME_ID]).toBe(t.folders[HOME_ID]!)
    expect(next.folders.old).toBe(t.folders.old!)
    expect(treeHolds(next)).toBe(true)
  })
})

describe("ページのタイプを変えさせない確かめ", () => {
  test("ページがブックの間を動いても、タイプが替わっていれば見つける", () => {
    const moved = testPage(MARKDOWN, "p1")
    const from: Book = { ...b1, lineup: b1.lineup.filter(e => e.id !== "p1") }
    const to: Book = { ...b2, lineup: [...b2.lineup, moved] }
    expect(keepsPageTypesAcross([b1, b2], [from, to])).toBe(false)
    const same: Book = { ...b2, lineup: [...b2.lineup, drawingPage("p1")] }
    expect(keepsPageTypesAcross([b1, b2], [from, same])).toBe(true)
  })
})
