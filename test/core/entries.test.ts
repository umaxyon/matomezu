// フォルダの中身の並びを読む・変える計算: エントリを別のフォルダへ動かす・並べ替える・ゴミ箱に入れる・ゴミ箱から戻す、ゴミ箱に出入りした物を挙げる

import { describe, expect, test } from "bun:test"
import { outsideHolds } from "../../web/src/core/book"
import {
  binnedBetween,
  carriedEntry,
  type EntryMoved,
  isMoveRefusal,
  isWithin,
  movedEntry,
  movedWithBinders,
  NEW_BINDER,
  placeOf,
  restoredEntry,
  titleClashes,
  trashedEntry,
  trashRefOf,
  withFreeTitles,
} from "../../web/src/core/entries"
import {
  type Folder,
  HOME_ID,
  type HomeFolder,
  type Library,
  type PlainFolder,
  TRASH_ID,
  type TrashFolder,
} from "../../web/src/core/folders"
import { treeHolds } from "../../web/src/core/folders-tree"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, libraryWith, NAMING, worldTablesOf } from "../support"

const b1 = testBook("b1", "一", [drawingPage("p1"), testBinder("f1", "束", SLIDE, testPage(SLIDE, "s1"))])
const b2 = testBook("b2", "二", [drawingPage("p2")])
// 書庫ホーム > a（b1・フォルダ c（b2））・d（空）
const c: PlainFolder = { folderRole: "folder", id: "c", title: "c", lineup: [{ kind: "book", id: "b2" }] }
const a: PlainFolder = {
  folderRole: "folder",
  id: "a",
  title: "a",
  lineup: [
    { kind: "book", id: "b1" },
    { kind: "folder", id: "c" },
  ],
}
const d: PlainFolder = { folderRole: "folder", id: "d", title: "d", lineup: [] }
const home: HomeFolder = {
  folderRole: "home",
  id: HOME_ID,
  lineup: [
    { kind: "folder", id: "a" },
    { kind: "folder", id: "d" },
  ],
}
const world = (): Library => worldTablesOf([b1, b2], [home, a, c, d])
const moved = (t: Library, entry: string, into: string, index?: number): Library => {
  const next = movedEntry(t, entry, into, index)
  if (isMoveRefusal(next)) throw new Error(next)
  return next
}
const ids = (f: Folder | undefined) => f?.lineup.map(r => r.id)

describe("エントリの置き場所", () => {
  test("入れているフォルダと、並びの中のエントリを引く（書庫ホームと、無い物は引けない）", () => {
    const t = world()
    expect(placeOf(t.folders, "b2")).toEqual({ holder: c, ref: { kind: "book", id: "b2" } })
    expect(placeOf(t.folders, "s1")?.holder.id).toBe("f1")
    expect(placeOf(t.folders, HOME_ID)).toBeUndefined()
    expect(placeOf(t.folders, "none")).toBeUndefined()
  })

  test("自分と、何段下の物でも、中に在ると答える", () => {
    const t = world()
    expect(isWithin(t.folders, "a", "a")).toBe(true)
    expect(isWithin(t.folders, "p2", "a")).toBe(true)
    expect(isWithin(t.folders, "a", "c")).toBe(false)
    expect(isWithin(t.folders, "d", "a")).toBe(false)
  })
})

describe("エントリを動かす", () => {
  test("別のフォルダの末尾・何番目かへ動かすと、元のフォルダから外れ、木の決まりを守る", () => {
    const t = moved(world(), "b2", "a", 0)
    expect(ids(t.folders.a)).toEqual(["b2", "b1", "c"])
    expect(ids(t.folders.c)).toEqual([])
    expect(treeHolds(t)).toBe(true)
    const end = moved(world(), "c", "d")
    expect(ids(end.folders.a)).toEqual(["b1"])
    expect(ids(end.folders.d)).toEqual(["c"])
    expect(treeHolds(end)).toBe(true)
  })

  test("同じフォルダの中の並べ替えは、動かす物を除いて数える", () => {
    expect(ids(moved(world(), "b1", "a", 1).folders.a)).toEqual(["c", "b1"])
    expect(ids(moved(world(), "b1", "a").folders.a)).toEqual(["c", "b1"])
    expect(movedEntry(world(), "b1", "a", 0)).toBe("same-place")
    expect(movedEntry(world(), "c", "a")).toBe("same-place")
    expect(movedEntry(world(), "b1", "a", 2)).toBe("past-end")
  })

  test("ブックのページとバインダを外へ出せる。ブックの外のページをブックへ、バインダの中へ入れられる", () => {
    const out = moved(moved(world(), "p1", "d"), "f1", HOME_ID, 0)
    expect(ids(out.folders.b1)).toEqual([])
    expect(ids(out.folders.d)).toEqual(["p1"])
    expect(ids(out.folders[HOME_ID])).toEqual(["f1", "a", "d"])
    expect(treeHolds(out)).toBe(true)
    const back = moved(moved(out, "p1", "b2", 0), "s1", "b1")
    expect(ids(back.folders.b2)).toEqual(["p1", "p2"])
    expect(ids(back.folders.b1)).toEqual(["s1"])
    expect(ids(moved(world(), "p1", "f1", 0).folders.f1)).toEqual(["p1", "s1"])
  })

  test("無い物・無い先・自分かその中・持てない種類は動かせない", () => {
    const t = world()
    expect(movedEntry(t, "none", "d")).toBe("no-entry")
    expect(movedEntry(t, HOME_ID, "d")).toBe("no-entry")
    expect(movedEntry(t, "b1", "none")).toBe("no-folder")
    expect(movedEntry(t, "a", "a")).toBe("into-itself")
    expect(movedEntry(t, "a", "c")).toBe("into-itself")
    // ブックの中にブック・フォルダは入らず、バインダの中にはページだけ
    expect(movedEntry(t, "b2", "b1")).toBe("kind")
    expect(movedEntry(t, "d", "b1")).toBe("kind")
    expect(movedEntry(t, "f1", "f1")).toBe("into-itself")
    expect(movedEntry(moved(t, "f1", "d"), "f1", "b2")).not.toBe("kind")
    expect(movedEntry(t, "b2", "f1")).toBe("kind")
  })
})

describe("スライドがバインダを離れる（movedWithBinders）", () => {
  const slide = (id: string) => testPage(SLIDE, id, { title: id.toUpperCase() })
  // 書庫ホーム > ブック bk（p1・バインダ bi「中」〈i1・i2〉・バインダ bs「単」〈j1〉）・バインダ n1「N1」〈n1a・n1b〉・n2「N2」〈n2a〉・フォルダ d（空）
  const sample = (): Library => {
    const lib = libraryWith(
      [
        testBook("bk", "本", [
          drawingPage("p1"),
          testBinder("bi", "中", SLIDE, slide("i1"), slide("i2")),
          testBinder("bs", "単", SLIDE, slide("j1")),
        ]),
      ],
      [testBinder("n1", "N1", SLIDE, slide("n1a"), slide("n1b")), testBinder("n2", "N2", SLIDE, slide("n2a"))],
    )
    const home = lib.folders[HOME_ID] as HomeFolder
    return {
      pages: lib.pages,
      folders: {
        ...lib.folders,
        d,
        [HOME_ID]: { ...home, lineup: [...home.lineup, { kind: "folder", id: "d" }] },
      },
    }
  }
  const ids = (l: Library, f: string) => l.folders[f]?.lineup.map(r => r.id)
  const run = (l: Library, entry: string, into: string, index?: number, id = "nb"): EntryMoved => {
    const done = movedWithBinders(CORE_CATALOG, l, entry, into, index, NAMING, () => id)
    if (isMoveRefusal(done)) throw new Error(done)
    return done
  }

  test("フォルダ・書庫ホーム・ブックの並びの index 番目に、そのページだけのバインダ「元のバインダの名前 - ページの名前」が出来る", () => {
    const l = sample()
    for (const [into, index] of [
      ["d", 0],
      [HOME_ID, 1],
      ["bk", 1],
    ] as const) {
      const { next, carried, made } = run(l, "n1a", into, index)
      expect(made).toEqual({ id: "nb", title: "N1 - N1A" })
      expect(carried).toEqual({ kind: "binder", id: "nb" })
      expect(ids(next, into)?.[index]).toBe("nb")
      expect(next.folders.nb).toEqual({
        folderRole: "binder",
        id: "nb",
        title: "N1 - N1A",
        pageType: SLIDE,
        lineup: [{ kind: "page", id: "n1a" }],
      })
      expect(ids(next, "n1")).toEqual(["n1b"])
      expect(next.pages.n1a).toBe(l.pages.n1a)
      expect(treeHolds(next) && outsideHolds(CORE_CATALOG, l, next)).toBe(true)
    }
    expect(carriedEntry(CORE_CATALOG, l, "n1a", "d")).toBe(NEW_BINDER)
  })

  test("入る先に同じ名前が在れば番号を付ける。同じ id を渡せば同じ結果。id が書庫にもう在れば断る", () => {
    const l = sample()
    const named: PlainFolder = { folderRole: "folder", id: "x", title: "N1 - N1A", lineup: [] }
    const d2 = { ...d, lineup: [{ kind: "folder" as const, id: "x" }] }
    const clashing: Library = { pages: l.pages, folders: { ...l.folders, x: named, d: d2 } }
    expect(run(clashing, "n1a", "d").made?.title).toBe("N1 - N1A 2")
    expect(run(l, "n1a", "d")).toEqual(run(l, "n1a", "d"))
    expect(movedWithBinders(CORE_CATALOG, l, "n1a", "d", undefined, NAMING, () => "n2")).toBe("id-taken")
    expect(movedWithBinders(CORE_CATALOG, l, "n1a", "d", undefined, NAMING, () => "p1")).toBe("id-taken")
    expect(movedWithBinders(CORE_CATALOG, l, "n1a", "d", 5, NAMING, () => "nb")).toBe("past-end")
  })

  test("ブックの外の、中がそのページだけのバインダからは、作らずにバインダごと動く（id と名前が保たれる）", () => {
    const l = sample()
    expect(carriedEntry(CORE_CATALOG, l, "n2a", "d")).toEqual({ kind: "binder", id: "n2" })
    const { next, carried, made } = run(l, "n2a", "d")
    expect(made).toBeUndefined()
    expect(carried).toEqual({ kind: "binder", id: "n2" })
    expect(ids(next, "d")).toEqual(["n2"])
    expect(next.folders.n2).toMatchObject({ title: "N2", lineup: [{ kind: "page", id: "n2a" }] })
    expect(next.folders.nb).toBeUndefined()
  })

  test("ブックの中の、中がそのページだけのバインダから出すと、元は空で残り、バインダが出来る", () => {
    const l = sample()
    const { next, made } = run(l, "j1", "d")
    expect(made).toEqual({ id: "nb", title: "単 - J1" })
    expect(ids(next, "bs")).toEqual([])
    expect(ids(next, "bk")).toContain("bs")
  })

  test("ほかのバインダへ移して、ブックの外の元のバインダが空になると行ごと消える。ブックの中の元は空で残る", () => {
    const l = sample()
    const out = run(l, "n2a", "n1", 0)
    expect(out.carried).toEqual({ kind: "page", id: "n2a" })
    expect(ids(out.next, "n1")).toEqual(["n2a", "n1a", "n1b"])
    expect(out.next.folders.n2).toBeUndefined()
    expect(ids(out.next, HOME_ID)).not.toContain("n2")
    expect(outsideHolds(CORE_CATALOG, l, out.next)).toBe(true)
    const inBook = run(l, "j1", "n1").next
    expect(ids(inBook, "bs")).toEqual([])
    expect(inBook.folders.bs).toBeDefined()
  })

  test("まとまらないタイプのページ・バインダ・ゴミ箱へは、movedEntry と同じ", () => {
    const l = sample()
    const plain = run(l, "p1", "d")
    expect(plain.next).toEqual(moved(l, "p1", "d"))
    expect(plain.carried).toEqual({ kind: "page", id: "p1" })
    expect(run(l, "n1", "d").next).toEqual(moved(l, "n1", "d"))
    const trash: TrashFolder = { folderRole: "trash", id: TRASH_ID, lineup: [] }
    const binned: Library = { pages: l.pages, folders: { ...l.folders, [TRASH_ID]: trash } }
    expect(movedWithBinders(CORE_CATALOG, binned, "n1a", TRASH_ID, undefined, NAMING, () => "nb")).toBe("in-trash")
  })
})

describe("ゴミ箱", () => {
  // d をゴミ箱に入れた世界（d は a の中に在った物として、元いた所を a から上へ持つ）
  const trash: TrashFolder = {
    folderRole: "trash",
    id: TRASH_ID,
    lineup: [{ kind: "folder", id: "d", trashed: "2026-11-18T00:00:00.000Z", from: ["a", HOME_ID] }],
  }
  const trashed = (): Library => {
    const t = world()
    const inD = moved(t, "b2", "d")
    return {
      pages: inD.pages,
      folders: { ...inD.folders, [HOME_ID]: { ...home, lineup: [{ kind: "folder", id: "a" }] }, [TRASH_ID]: trash },
    }
  }

  test("ゴミ箱は書庫ホームと並ぶ一番上で、中の物も木の決まりを守る", () => {
    expect(treeHolds(trashed())).toBe(true)
    expect(
      treeHolds({ pages: world().pages, folders: { ...world().folders, [TRASH_ID]: { ...trash, lineup: [] } } }),
    ).toBe(true)
  })

  test("ゴミ箱の中の物・ゴミ箱の中へ・ゴミ箱そのものへは、動かせない（入れる・戻すでだけ出入りする）", () => {
    const t = trashed()
    expect(movedEntry(t, "d", HOME_ID)).toBe("in-trash")
    expect(movedEntry(t, "b2", "a")).toBe("in-trash")
    expect(movedEntry(t, "b1", "d")).toBe("in-trash")
    expect(movedEntry(t, "b1", TRASH_ID)).toBe("in-trash")
  })

  test("ゴミ箱に入れると、入っていたフォルダから外れ、ゴミ箱の末尾に、入れた時刻と元いたフォルダから上への列を持って入る（ゴミ箱の行が無ければ作る）", () => {
    const at = "2026-11-18T01:00:00.000Z"
    const t = trashedEntry(world(), "b2", at) as Library
    expect(ids(t.folders.c)).toEqual([])
    expect(t.folders[TRASH_ID]?.lineup).toEqual([{ kind: "book", id: "b2", trashed: at, from: ["c", "a", HOME_ID] }])
    expect(t.folders.b2).toBe(world().folders.b2)
    expect(treeHolds(t)).toBe(true)
    const more = trashedEntry(t, "a", at) as Library
    expect(ids(more.folders[TRASH_ID])).toEqual(["b2", "a"])
    expect(trashRefOf(more.folders, "a")?.from).toEqual([HOME_ID])
    // 無い物・ゴミ箱の中の物は入れられない
    expect(trashedEntry(t, "none", at)).toBe("no-entry")
    expect(trashedEntry(t, "b2", at)).toBe("in-trash")
    expect(trashedEntry(more, "b1", at)).toBe("in-trash")
    // フォルダごと入れると、中の物も、ゴミ箱に入った物に数える（戻すと、出た物に）
    expect(binnedBetween(t, more).trashed.sort()).toEqual(["a", "b1", "c", "f1", "p1", "s1"])
    expect(binnedBetween(more, t).restored.sort()).toEqual(["a", "b1", "c", "f1", "p1", "s1"])
    expect(binnedBetween(t, t)).toEqual({ trashed: [], restored: [] })
  })

  test("ゴミ箱の直下の物を、フォルダの末尾へ戻す。ゴミ箱の直下に無い物・無い先・ゴミ箱の中の先・持てない先へは戻せない", () => {
    const t = trashed()
    const back = restoredEntry(t, "d", "a") as Library
    expect(ids(back.folders.a)).toEqual(["b1", "c", "d"])
    expect(back.folders.a?.lineup.at(-1)).toEqual({ kind: "folder", id: "d" })
    expect(ids(back.folders[TRASH_ID])).toEqual([])
    expect(treeHolds(back)).toBe(true)
    expect(restoredEntry(t, "b2", "a")).toBe("no-entry")
    expect(restoredEntry(t, "b1", "a")).toBe("no-entry")
    expect(restoredEntry(t, "d", "none")).toBe("no-folder")
    expect(restoredEntry(t, "d", TRASH_ID)).toBe("in-trash")
    expect(restoredEntry(t, "d", "b1")).toBe("kind")
  })
})

describe("同じ名前", () => {
  const named = (id: string, title: string, lineup: PlainFolder["lineup"] = []): PlainFolder => ({
    folderRole: "folder",
    id,
    title,
    lineup,
  })
  const withRows = (t: Library, ...rows: Folder[]): Library => ({
    pages: t.pages,
    folders: { ...t.folders, ...Object.fromEntries(rows.map(r => [r.id, r])) },
  })

  test("書庫ホームとフォルダの直下で、種類をまたいで名前が重なったフォルダを挙げる。重ならなければ挙げない", () => {
    const t = world()
    expect(titleClashes(t, NAMING)).toEqual([])
    // フォルダ d の名前を、同じ書庫ホームの直下のフォルダ a と同じにする
    expect(titleClashes(withRows(t, { ...d, title: "a" }), NAMING)).toEqual([HOME_ID])
    // ブック b1（名前「一」）と同じフォルダ a の直下のフォルダ c を、同じ名前にする
    expect(titleClashes(withRows(t, { ...c, title: "一" }), NAMING)).toEqual(["a"])
    // 別のフォルダの物とは重ならない
    expect(titleClashes(withRows(t, { ...d, title: "c" }), NAMING)).toEqual([])
  })

  test("ゴミ箱の直下は同じ名前を許し、ゴミ箱の中のフォルダの直下は数える。ブックの中で重なれば、そのブックを挙げる", () => {
    const t = world()
    const at = "2026-11-18T00:00:00.000Z"
    const binned = trashedEntry(trashedEntry(withRows(t, { ...d, title: "a" }), "a", at) as Library, "d", at) as Library
    expect(titleClashes(binned, NAMING)).toEqual([])
    const inTrash = withRows(binned, { ...c, title: "一" })
    expect(titleClashes(inTrash, NAMING)).toEqual(["a"])
    expect(titleClashes(moved(t, "p2", "b1"), NAMING)).toEqual(["b1"])
  })

  describe("名前の重なりに番号を付ける（withFreeTitles）", () => {
    const titles = (t: Library, folder: string) =>
      t.folders[folder]?.lineup.map(r =>
        r.kind === "page" ? t.pages[r.id]?.title : (t.folders[r.id] as { title?: string }).title,
      )
    const homeWith = (t: Library, ...rows: PlainFolder[]): Library =>
      withRows(t, ...rows, {
        ...home,
        lineup: [...home.lineup, ...rows.map(r => ({ kind: "folder" as const, id: r.id }))],
      })

    test("並びの先の物が名前を残し、後の物に、ほかの物の名前とも重ならない番号を付ける。付けたあとは重なりが無く、2 回目は何も変えない", () => {
      // 書庫ホーム: a・d・x「a」・y「a 2」
      const t = homeWith(world(), named("x", "a"), named("y", "a 2"))
      const { next, freed } = withFreeTitles(t, NAMING)
      expect(titles(next, HOME_ID)).toEqual(["a", "d", "a 3", "a 2"])
      expect(freed).toEqual([{ kind: "folder", id: "x", title: "a 3" }])
      expect(titleClashes(next, NAMING)).toEqual([])
      expect(withFreeTitles(next, NAMING)).toEqual({ next, freed: [] })
    })

    test("ブックの中・ゴミ箱の中のフォルダの直下も直し、ゴミ箱の直下は直さない。重ならなければ書庫のまま", () => {
      const t = world()
      expect(withFreeTitles(t, NAMING).next).toBe(t)
      const inBook = moved(t, "p2", "b1")
      const pages = withFreeTitles(inBook, NAMING).next
      expect(titleClashes(pages, NAMING)).toEqual([])
      const at = "2026-11-18T00:00:00.000Z"
      const binned = trashedEntry(
        trashedEntry(withRows(t, { ...d, title: "a" }), "a", at) as Library,
        "d",
        at,
      ) as Library
      const inTrash = withRows(binned, { ...c, title: "一" })
      const fixed = withFreeTitles(inTrash, NAMING)
      expect(fixed.freed).toEqual([{ kind: "folder", id: "c", title: "一 2" }])
      expect(titles(fixed.next, TRASH_ID)).toEqual(["a", "a"])
    })

    test("ロックの掛かった物にも番号を付ける", () => {
      const t = homeWith(world(), { ...named("x", "a"), locked: true } as unknown as PlainFolder)
      expect(withFreeTitles(t, NAMING).freed).toEqual([{ kind: "folder", id: "x", title: "a 2" }])
    })
  })
})
