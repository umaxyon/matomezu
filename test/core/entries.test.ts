// 書庫の木を変える計算: エントリを別のフォルダへ動かす・並べ替える

import { describe, expect, test } from "bun:test"
import { isMoveRefusal, isWithin, movedEntry, placeOf } from "../../web/src/core/entries"
import {
  type Folder,
  HOME_ID,
  type HomeFolder,
  type PlainFolder,
  type Tables,
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
const world = (): Tables => worldTablesOf([b1, b2], [home, a, c, d])
const moved = (t: Tables, entry: string, into: string, index?: number): Tables => {
  const puts = movedEntry(t, entry, into, index)
  if (isMoveRefusal(puts)) throw new Error(puts)
  return { pages: t.pages, folders: { ...t.folders, ...puts } }
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
