// 作業机とその下の行（library/workdesk-rows.ts と outline.ts）: ワークルームのフォルダの下に作業机、その下にワーカーブックとその中の物を、作業机ごとの行 id で出す。
// 行 id から実の id へ直し、古い行 id（作業机が無くなった・作業が変わった・ブックがまだ無い）は残っている一番近い上の行へ戻す

import { expect, test } from "bun:test"
import {
  backyardIdOf,
  type Folder,
  HOME_ID,
  type HomeFolder,
  type Library,
  type PlainFolder,
} from "../../../web/src/core/folders"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { draggable, droppable } from "../../../web/src/plugins/base/library/drop"
import {
  arrivedAt,
  NOT_OPENED,
  openedFolderOf,
  openTargetOf,
  pathTo,
  rowsIn,
  shownFoldersOf,
  treeCurrentOf,
  treeRowsOf,
} from "../../../web/src/plugins/base/library/outline"
import { WORKROOMS } from "../../../web/src/plugins/base/library/system-folders"
import {
  deskBookRowId,
  deskEntryRowId,
  deskRowId,
  NO_DESKS,
  realOf,
} from "../../../web/src/plugins/base/library/workdesk-rows"
import type { Workdesk } from "../../../web/src/plugins/base/participant/workdesks"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../../lineup"
import { CORE_CATALOG, NAMING, worldTablesOf } from "../../support"

const YARD = backyardIdOf(TICKETS_HISTORY.id)
// 書庫ホーム > ワークルームのフォルダ wr。バックヤードにワーカーブック wb（p1・バインダ n1（s1））と wc（p3）
const wb = testBook("wb", "M-0133", [drawingPage("p1"), testBinder("n1", "束", SLIDE, testPage(SLIDE, "s1"))])
const wc = testBook("wc", "M-0126", [drawingPage("p3")])
const wr = {
  folderRole: "folder",
  id: "wr",
  title: "",
  systemFolder: WORKROOMS.id,
  lineup: [],
} as unknown as PlainFolder
const home: HomeFolder = { folderRole: "home", id: HOME_ID, lineup: [{ kind: "folder", id: "wr" }] }
const library = (): Library => {
  const t = worldTablesOf([wb, wc], [home, wr])
  const yard = {
    folderRole: "backyard",
    id: YARD,
    backyard: TICKETS_HISTORY.id,
    lineup: [
      { kind: "book", id: "wb", workKey: { subject: "t", id: "1" } },
      { kind: "book", id: "wc", workKey: { subject: "t", id: "2" } },
    ],
  } as Folder
  return { pages: t.pages, folders: { ...t.folders, [YARD]: yard } }
}
const desk = (room: string, book: string | undefined, title = room): Workdesk => ({
  room,
  title,
  bird: "suzume",
  palette: "p",
  bookTitle: `${title} の机`,
  book,
})
// r1 と r2 は同じブック wb を今の作業にし、r3 はブックがまだ無い
const DESKS = [desk("r1", "wb"), desk("r2", "wb"), desk("r3", undefined)]
const folders = () => library().folders

test("ワークルームのフォルダの下に作業机、その下にワーカーブック（まだ無ければ、中の無い行）、その下に中の物を、作業机ごとの id で出す", () => {
  const l = library()
  expect(rowsIn(l, "wr", NAMING, DESKS).map(r => [r.id, r.title, r.desk?.bird])).toEqual([
    [deskRowId("r1"), "r1", "suzume"],
    [deskRowId("r2"), "r2", "suzume"],
    [deskRowId("r3"), "r3", "suzume"],
  ])
  expect(rowsIn(l, deskRowId("r1"), NAMING, DESKS)).toMatchObject([
    { id: deskBookRowId("r1"), kind: "book", title: "M-0133" },
  ])
  expect(rowsIn(l, deskRowId("r3"), NAMING, DESKS)).toMatchObject([
    { id: deskBookRowId("r3"), title: "r3 の机", readable: true, nothingIn: true },
  ])
  // 同じ実のブックでも、作業机ごとに別の id
  expect(rowsIn(l, deskBookRowId("r1"), NAMING, DESKS).map(r => r.id)).toEqual([
    deskEntryRowId("r1", "p1"),
    deskEntryRowId("r1", "n1"),
  ])
  expect(rowsIn(l, deskBookRowId("r2"), NAMING, DESKS).map(r => r.id)).toEqual([
    deskEntryRowId("r2", "p1"),
    deskEntryRowId("r2", "n1"),
  ])
  expect(rowsIn(l, deskEntryRowId("r1", "n1"), NAMING, DESKS).map(r => r.id)).toEqual([deskEntryRowId("r1", "s1")])
  // 作業机が無ければ、ワークルームのフォルダは空
  expect(rowsIn(l, "wr", NAMING, NO_DESKS)).toEqual([])
})

test("パンくずと開く先は、実の物で決める（ブックがまだ無いワーカーブック・無くなった作業机は開かない）", () => {
  const f = folders()
  expect(pathTo(f, deskEntryRowId("r2", "s1"), DESKS)).toEqual([
    HOME_ID,
    "wr",
    deskRowId("r2"),
    deskBookRowId("r2"),
    deskEntryRowId("r2", "n1"),
    deskEntryRowId("r2", "s1"),
  ])
  const open = (id: string, kind: "folder" | "book" | "page" | "binder") =>
    openTargetOf(f, { id, kind, readable: true }, DESKS)
  expect(open(deskRowId("r1"), "folder")).toEqual({ to: "folder", folder: deskRowId("r1") })
  expect(open(deskBookRowId("r1"), "book")).toEqual({ to: "book", book: "wb" })
  expect(open(deskEntryRowId("r1", "p1"), "page")).toEqual({ to: "book", book: "wb", page: "p1" })
  expect(open(deskBookRowId("r3"), "book")).toBe(NOT_OPENED)
  expect(open(deskRowId("r9"), "folder")).toBe(NOT_OPENED)
  expect(realOf(DESKS, f, deskEntryRowId("r1", "s1"))).toBe("s1")
  expect(realOf(DESKS, f, deskRowId("r1"))).toBe(deskRowId("r1"))
})

test("古い行 id は、残っている一番近い上の行に戻す: 作業が変わったら作業机のワーカーブック、作業机が無くなったらワークルームのフォルダ", () => {
  const f = folders()
  expect(openedFolderOf(f, deskEntryRowId("r1", "n1"), DESKS)).toBe(deskEntryRowId("r1", "n1"))
  // r1 の作業が wc に変わった: n1 は今のワーカーブックの中に無い
  const changed = [desk("r1", "wc"), desk("r2", "wb")]
  expect(openedFolderOf(f, deskEntryRowId("r1", "n1"), changed)).toBe(deskBookRowId("r1"))
  expect(rowsIn(library(), deskBookRowId("r1"), NAMING, changed).map(r => r.id)).toEqual([deskEntryRowId("r1", "p3")])
  // ブックがまだ無いワーカーブックは開けないので、作業机
  expect(openedFolderOf(f, deskBookRowId("r3"), DESKS)).toBe(deskRowId("r3"))
  // 作業机が無くなった
  expect(openedFolderOf(f, deskBookRowId("r9"), DESKS)).toBe("wr")
})

test("ツリーは中を出した作業机とその下を並べ、見せているフォルダは実の id で答える。行へ移ると、作業机までの道を開く", () => {
  const f = folders()
  const unfolded = [HOME_ID, "wr", deskRowId("r1"), deskBookRowId("r1")]
  expect(treeRowsOf(f, unfolded, false, DESKS).map(r => [r.id, r.holds, r.unfolded])).toEqual([
    [HOME_ID, true, true],
    ["wr", true, true],
    [deskRowId("r1"), true, true],
    [deskBookRowId("r1"), true, true],
    [deskEntryRowId("r1", "p1"), false, "not-unfoldable"],
    [deskEntryRowId("r1", "n1"), true, false],
    [deskRowId("r2"), true, false],
    [deskRowId("r3"), true, false],
    ["library-trash", true, "not-unfoldable"],
  ])
  expect(shownFoldersOf(f, deskEntryRowId("r1", "n1"), unfolded, DESKS)).toEqual(["n1", HOME_ID, "wr", "wb"])
  expect(treeCurrentOf(f, deskBookRowId("r1"), deskEntryRowId("r1", "p1"), DESKS)).toBe(deskEntryRowId("r1", "p1"))
  expect(treeCurrentOf(f, deskBookRowId("r1"), deskEntryRowId("r1", "n1"), DESKS)).toBe(deskBookRowId("r1"))
  const arrived = arrivedAt(
    f,
    { id: deskEntryRowId("r2", "s1"), holder: deskEntryRowId("r2", "n1"), holds: false },
    [HOME_ID],
    DESKS,
  )
  expect(arrived).toEqual({
    folder: deskEntryRowId("r2", "n1"),
    picked: deskEntryRowId("r2", "s1"),
    unfolded: [HOME_ID, "wr", deskRowId("r2"), deskBookRowId("r2"), deskEntryRowId("r2", "n1")],
  })
})

test("作業机の下の行の id は書庫の表に当たらないので、掴めず、落とす先にもならない（行の id をアクションに渡さない）", () => {
  // 書庫ホームに、動かせるブック bx とフォルダ fx を足した書庫
  const base = library()
  const bx = worldTablesOf([testBook("bx", "BX", [drawingPage("px")])], [])
  const l: Library = {
    pages: { ...base.pages, ...bx.pages },
    folders: {
      ...base.folders,
      ...bx.folders,
      fx: { folderRole: "folder", id: "fx", title: "FX", lineup: [] } as unknown as Folder,
      [HOME_ID]: {
        ...home,
        lineup: [...home.lineup, { kind: "folder", id: "fx" }, { kind: "book", id: "bx" }],
      } as Folder,
    },
  }
  expect(draggable(l.folders, "bx")).toBe(true)
  expect(droppable(CORE_CATALOG, l, "bx", { to: "folder", into: "fx" })).toBe(true)
  for (const id of [deskRowId("r1"), deskBookRowId("r1"), deskEntryRowId("r1", "p1")]) {
    expect(draggable(l.folders, id)).toBe(false)
    expect(droppable(CORE_CATALOG, l, "bx", { to: "folder", into: id })).toBe(false)
  }
})
