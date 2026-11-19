// フォルダの中身の並びを読む・変える計算: エントリを別のフォルダへ動かす・並べ替える・ゴミ箱に入れる・ゴミ箱から戻す、ゴミ箱に出入りした物を挙げる

import { describe, expect, test } from "bun:test"
import {
  binnedBetween,
  isMoveRefusal,
  isWithin,
  movedEntry,
  placeOf,
  restoredEntry,
  titleClashes,
  trashedEntry,
  trashRefOf,
} from "../../web/src/core/entries"
import {
  type Folder,
  HOME_ID,
  type HomeFolder,
  type Library,
  type PlainFolder,
  TRASH_ID,
  type TrashFolder,
  treeHolds,
  worldTablesOf,
} from "../../web/src/core/folders"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../lineup"

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
    expect(titleClashes(t, t)).toEqual([])
    // フォルダ d の名前を、同じ書庫ホームの直下のフォルダ a と同じにする
    expect(titleClashes(t, withRows(t, { ...d, title: "a" }))).toEqual([HOME_ID])
    // ブック b1（名前「一」）と同じフォルダ a の直下のフォルダ c を、同じ名前にする
    expect(titleClashes(t, withRows(t, { ...c, title: "一" }))).toEqual(["a"])
    // 別のフォルダの物とは重ならない
    expect(titleClashes(t, withRows(t, { ...d, title: "c" }))).toEqual([])
  })

  test("前から重なっていて、名前の並びが変わらないフォルダは挙げない。並びが変われば挙げる", () => {
    const kept = withRows(world(), { ...d, title: "a" })
    expect(titleClashes(kept, kept)).toEqual([])
    expect(titleClashes(kept, withRows(kept, { ...c, title: "別" }))).toEqual([])
    const e = named("e", "a")
    const more = withRows(kept, e, { ...home, lineup: [...home.lineup, { kind: "folder", id: "e" }] })
    expect(titleClashes(kept, more)).toEqual([HOME_ID])
  })

  test("ゴミ箱の直下は同じ名前を許す。ブックの中で重なれば、そのブックを挙げる", () => {
    const t = world()
    const at = "2026-11-18T00:00:00.000Z"
    const binned = trashedEntry(trashedEntry(withRows(t, { ...d, title: "a" }), "a", at) as Library, "d", at) as Library
    expect(titleClashes(t, binned)).toEqual([])
    const inBook = moved(t, "p2", "b1")
    expect(titleClashes(t, inBook)).toEqual(["b1"])
  })
})
