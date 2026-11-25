// 作業机（participant/workdesks.ts）: 今参加者がいるワークルームだけを、管理者が先・ほかは受け入れた順に並べ、ワーカーブックの実のブックを workKey で引く
import { expect, test } from "bun:test"
import type { PluginStateRead } from "../../../web/src/core/def/plugin-state"
import { backyardIdOf, type Folder, type Folders, HOME_ID } from "../../../web/src/core/folders"
import { readerOf, sourceOf } from "../../../web/src/core/record-source"
import type { Records } from "../../../web/src/core/records"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { LIBRARY_APPEARANCE, LIBRARY_FOLDER, LIBRARY_UNFOLDED } from "../../../web/src/plugins/base/library/state"
import { WORKROOMS } from "../../../web/src/plugins/base/library/system-folders"
import { deskBookRowId } from "../../../web/src/plugins/base/library/workdesk-rows"
import { ADMIN_MARK, PARTICIPANT } from "../../../web/src/plugins/base/participant"
import {
  ownBookPagesOf,
  type Workdesk,
  workdesksOf,
  workdesksReadsOf,
  workerBirdsOf,
} from "../../../web/src/plugins/base/participant/workdesks"
import { WORKROOM } from "../../../web/src/plugins/base/participant/workroom"
import { CORE_CATALOG } from "../../support"

const room = (id: string, name: string) => ({ id, name, bird: "suzume", createdAt: `2026-11-0${id.length}T00:00:00Z` })
const joined = (id: string, workroom: string, joinedAt: string) => ({
  id,
  state: "joined",
  ai: "claude",
  model: "m",
  env: "e",
  sessionName: "",
  link: `l-${id}`,
  workroom,
  requestedAt: "2026-11-01T00:00:00Z",
  joinedAt,
})
const requested = (id: string) => ({
  id,
  state: "requested",
  ai: "claude",
  model: "m",
  env: "e",
  sessionName: "",
  link: `l-${id}`,
  requestedAt: "2026-11-01T00:00:00Z",
})

const YARD = backyardIdOf(TICKETS_HISTORY.id)
// バックヤード tickets-history に、ワークルーム r2 の作業（空きのときは、ワークルーム自身）のブック wb2 が在る書庫の表
const folders: Folders = {
  [YARD]: {
    folderRole: "backyard",
    id: YARD,
    backyard: TICKETS_HISTORY.id,
    lineup: [{ kind: "book", id: "wb2", workKey: { subject: WORKROOM.id, id: "r2" } }],
  } as Folder,
}

const records = (admin?: string): Records =>
  ({
    [WORKROOM.id]: { r1: room("r1", "一"), r2: room("r2", "二"), r3: room("r3", "三"), r4: room("r4", "四") },
    [PARTICIPANT.id]: {
      p1: joined("p1", "r1", "2026-11-23T03:00:00Z"),
      p2: joined("p2", "r2", "2026-11-23T01:00:00Z"),
      p3: joined("p3", "r3", "2026-11-23T02:00:00Z"),
      p9: requested("p9"),
    },
    ...(admin ? { [ADMIN_MARK.id]: { admin: { id: "admin", workroom: admin } } } : {}),
  }) as unknown as Records

const desks = (rs: Records, subjects = workdesksReadsOf(CORE_CATALOG)) =>
  workdesksOf(CORE_CATALOG, readerOf(CORE_CATALOG, sourceOf(rs), subjects), folders)

test("参加者がいるワークルームだけを、受け入れた順に並べる（空室・要求中の参加者は出さない）。管理者のワークルームは先頭", () => {
  expect(desks(records()).map(d => d.room)).toEqual(["r2", "r3", "r1"])
  expect(desks(records("r1")).map(d => d.room)).toEqual(["r1", "r2", "r3"])
  expect(desks(records("r4")).map(d => d.room)).toEqual(["r2", "r3", "r1"])
})

test("ワーカーブックは workKey でバックヤードから引き、まだ無ければ book が無い。名前はワークルームの名前と鳥の元の配色", () => {
  const [r2, r3] = desks(records())
  expect(r2).toMatchObject({ room: "r2", title: "二", bird: "suzume", bookTitle: "二", book: "wb2" })
  expect(r2?.palette).not.toBe("")
  expect(r3).toMatchObject({ room: "r3", book: undefined })
})

test("読む種類に参加者が無ければ、作業机は無い（宣言した種類だけを読む）", () => {
  expect(desks(records(), [WORKROOM.id])).toEqual([])
})

test("書庫アピアランスは、宣言した種類のレコードから作業机を出し、作業机の下で見せているフォルダを実の id で答える", () => {
  // 書庫ホーム > ワークルームのフォルダ wr。バックヤードに wb2
  const library = {
    ...folders,
    [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [{ kind: "folder", id: "wr" }] },
    wr: { folderRole: "folder", id: "wr", systemFolder: WORKROOMS.id, lineup: [] },
    wb2: { folderRole: "book", id: "wb2", title: "二", lineup: [] },
  } as unknown as Folders
  const shown = (opened: string, rs: Records) =>
    LIBRARY_APPEARANCE.shownFolders(
      library,
      (<S>(def: { id: string }) =>
        (def.id === LIBRARY_FOLDER.id ? opened : def.id === LIBRARY_UNFOLDED.id ? [] : undefined) as
          | S
          | undefined) as PluginStateRead,
      readerOf(CORE_CATALOG, sourceOf(rs), LIBRARY_APPEARANCE.readsSubjects?.(CORE_CATALOG) ?? []),
      CORE_CATALOG,
    )
  expect(shown(deskBookRowId("r2"), records())).toContain("wb2")
  // 作業机が無ければ（参加者がいなければ）、作業机の下の行は見せていない
  expect(shown(deskBookRowId("r2"), {} as Records)).not.toContain("wb2")
})

test("ワークルーム自身のワーカーブックのページの数（バインダーの中も数える。ブックが無ければ 0）", () => {
  const YARD = backyardIdOf(TICKETS_HISTORY.id)
  const folders = {
    [YARD]: {
      folderRole: "backyard",
      id: YARD,
      backyard: TICKETS_HISTORY.id,
      lineup: [
        { kind: "book", id: "own", workKey: { subject: "@matomezu/base:workroom", id: "r1" } },
        { kind: "book", id: "tk", workKey: { subject: "@matomezu/taskboard:ticket", id: "r1" } },
      ],
    },
    own: {
      folderRole: "book",
      id: "own",
      title: "own",
      lineup: [
        { kind: "page", id: "p1" },
        { kind: "binder", id: "d1" },
      ],
    },
    d1: { folderRole: "binder", id: "d1", title: "d", lineup: [{ kind: "page", id: "p2" }] },
    tk: { folderRole: "book", id: "tk", title: "tk", lineup: [{ kind: "page", id: "p3" }] },
  } as unknown as Folders
  expect(ownBookPagesOf(folders, "r1")).toBe(2)
  expect(ownBookPagesOf(folders, "r2")).toBe(0)
})

test("ワーカーブックの鳥: ワークルーム自身のブックはそのワークルーム（参加者がいなくても）、作業のブックはそれを映している作業机のワークルーム、ほかのブックは無し", () => {
  const desk = (room: string, book: string | undefined): Workdesk => ({
    room,
    title: room,
    bird: "inko",
    palette: "p",
    bookTitle: "",
    book,
  })
  const yard = {
    ...folders,
    [YARD]: {
      ...(folders[YARD] as Folder),
      lineup: [
        { kind: "book", id: "wb2", workKey: { subject: WORKROOM.id, id: "r2" } },
        { kind: "book", id: "wt", workKey: { subject: "ticket", id: "t1" } },
      ],
    } as Folder,
  }
  const rooms = [room("r2", "二")] as never
  const names = (book: string, desks: readonly Workdesk[]) => workerBirdsOf(yard, book, desks, rooms).map(b => b.title)
  expect(names("wb2", [])).toEqual(["二"])
  expect(names("wt", [])).toEqual([])
  expect(names("wt", [desk("r1", "wt")])).toEqual(["r1"])
  expect(names("wt", [desk("r1", "wt"), desk("r3", "x"), desk("r4", "wt")])).toEqual(["r1", "r4"])
  expect(names("plain", [desk("r1", "plain")])).toEqual([])
})
