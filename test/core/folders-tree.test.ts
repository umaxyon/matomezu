// 書庫の木: 書庫ホームとフォルダと、木の決まり、ブックを足す・消すときの置き場所の書き込み

import { describe, expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { keepsPageTypesAcross } from "../../web/src/core/book"
import {
  bookIdOf,
  type Folder,
  foldersOver,
  HOME_ID,
  homeAndFoldersOf,
  homeOver,
  libraryOf,
  NO_CHANGES,
  type PlainFolder,
  placedChanges,
  rawBooksOf,
  restoredTables,
  type Tables,
  treeHolds,
  withChanges,
  worldTablesOf,
} from "../../web/src/core/folders"
import { performIn, type World } from "../../web/src/core/perform"
import { REMOVED } from "../../web/src/core/records"
import type { Book } from "../../web/src/core/schema/book"
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
const tables = (): Tables => worldTablesOf([b1, b2], [home, old])
const withFolders = (t: Tables, ...folders: Folder[]): Tables => ({
  pages: t.pages,
  folders: { ...t.folders, ...Object.fromEntries(folders.map(f => [f.id, f])) },
})

describe("書庫ホームとフォルダ", () => {
  test("置き場所の行から、書庫ホームとフォルダだけを形を確かめて取り出す（形に合わない行・ブック・バインダは入らない）", () => {
    const rows = [
      home,
      old,
      { folderRole: "folder", id: "x", lineup: [] },
      { folderRole: "folder", id: "y", title: "ページ入り", lineup: [{ kind: "page", id: "p1" }] },
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

  test("書庫ホームとフォルダのエントリは、ブックかフォルダで、種類が合う（表に無い book は、読めないブックとして通す）", () => {
    const t = tables()
    expect(treeHolds(withFolders(t, { ...old, lineup: [...old.lineup, { kind: "book", id: "unread" }] }))).toBe(true)
    expect(treeHolds(withFolders(t, { ...old, lineup: [...old.lineup, { kind: "folder", id: "none" }] }))).toBe(false)
    expect(treeHolds(withFolders(t, { ...old, lineup: [{ kind: "folder", id: "b1" }, old.lineup[1]!] }))).toBe(false)
  })
})

describe("ブックを足す・消すときの置き場所", () => {
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: "@matomezu/control-center:control-center" as const,
    lang: "en" as const,
    newId: sequence("n"),
    now: "2026-01-01T00:00:00.000Z",
    actor: USER,
  }
  const worldOf = (t: Tables): World => ({ ...t, settings: {}, annotations: {}, records: {}, counters: {} })

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

  test("完全に消したブックは、入っていたフォルダの並びから外れる", () => {
    const trashed: Book = { ...b2, trashed: "2026-01-01T00:00:00.000Z" }
    const world = worldOf(worldTablesOf([b1, trashed], [home, old]))
    const done = performIn(world, "@matomezu/base:book-purge", { books: ["b2"] }, undefined, ctx as never)
    expect(done.ok).toBe(true)
    if (!done.ok || !done.changes) throw new Error("no changes")
    expect(done.changes.folders.b2).toBe(REMOVED)
    expect(done.changes.folders.old).toEqual({ ...old, lineup: [{ kind: "book", id: "b1" }] })
    expect(HOME_ID in done.changes.folders).toBe(false)
    expect(treeHolds(withChanges(world, done.changes))).toBe(true)
  })

  test("書庫ホームの無い世界では、ブックを作れない", () => {
    const world = worldOf(worldTablesOf([b1, b2], []))
    const done = performIn(world, "@matomezu/base:book-create", { title: "新" }, undefined, ctx as never)
    expect(done).toEqual({ ok: false, reason: "refused" })
  })
})

describe("置き直し（元に戻す）", () => {
  test("ブックのページを置き直しても、書庫ホームとフォルダは残る", () => {
    const t = tables()
    const next = restoredTables(t, { pages: { p2: { absent: true } as never }, folders: {} })
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
