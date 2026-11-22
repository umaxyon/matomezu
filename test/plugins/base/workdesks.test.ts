// 作業机（participant/workdesks.ts）: 今参加者がいるワークルームだけを、管理者が先・ほかは受け入れた順に並べ、ワーカーブックの実のブックを workKey で引く
import { expect, test } from "bun:test"
import { backyardIdOf, type Folder, type Folders } from "../../../web/src/core/folders"
import { readerOf, sourceOf } from "../../../web/src/core/record-source"
import type { Records } from "../../../web/src/core/records"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { ADMIN_MARK, PARTICIPANT } from "../../../web/src/plugins/base/participant"
import { workdesksOf, workdesksReadsOf } from "../../../web/src/plugins/base/participant/workdesks"
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
