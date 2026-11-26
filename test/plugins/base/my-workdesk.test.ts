// 呼んだ AI の作業机（participant/my-workdesk.ts）: ワークルームのフォルダとワーカーブックを引き、ページの数はバインダの中も数え、参加の文はページの数で言い分ける
import { expect, test } from "bun:test"
import { backyardIdOf, type Folder, type Folders } from "../../../web/src/core/folders"
import { sourceOf } from "../../../web/src/core/record-source"
import type { Records } from "../../../web/src/core/records"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { MY_WORKDESK, WORKROOMS } from "../../../web/src/plugins/base/library/system-folders"
import { myWorkdeskIn } from "../../../web/src/plugins/base/participant/my-workdesk"
import { WRITE_IN_WORKER_BOOK } from "../../../web/src/plugins/base/participant/worker-page-add"
import { WORKROOM } from "../../../web/src/plugins/base/participant/workroom"
import { CORE_CATALOG } from "../../support"

const YARD = backyardIdOf(TICKETS_HISTORY.id)
const room = (id: string) => ({ id, name: id, bird: "suzume", createdAt: "2026-11-01T00:00:00Z" })
const records = { [WORKROOM.id]: { r1: room("r1"), r2: room("r2"), r3: room("r3") } } as Records

// r1 のブックは、ページ 1 枚とバインダ（ページ 2 枚）を持つ。r2 のブックはページ 1 枚。r3 のブックは無い
const folders: Folders = {
  wf: { folderRole: "folder", id: "wf", systemFolder: WORKROOMS.id, lineup: [] } as Folder,
  [YARD]: {
    folderRole: "backyard",
    id: YARD,
    backyard: TICKETS_HISTORY.id,
    lineup: [
      { kind: "book", id: "b1", workKey: { subject: WORKROOM.id, id: "r1" } },
      { kind: "book", id: "b2", workKey: { subject: WORKROOM.id, id: "r2" } },
    ],
  } as Folder,
  b1: {
    folderRole: "book",
    id: "b1",
    title: "r1",
    lineup: [
      { kind: "page", id: "p1" },
      { kind: "binder", id: "bd" },
    ],
  } as Folder,
  bd: {
    folderRole: "binder",
    id: "bd",
    title: "bd",
    pageType: "@matomezu/drawing:drawing",
    lineup: [
      { kind: "page", id: "p2" },
      { kind: "page", id: "p3" },
    ],
  } as Folder,
  b2: { folderRole: "book", id: "b2", title: "r2", lineup: [{ kind: "page", id: "p4" }] } as Folder,
}

const deskOf = (room: string) => myWorkdeskIn(CORE_CATALOG, sourceOf(records), folders, room)

test("ワーカーブックのページの数は、バインダの中のページも数える", () => {
  expect(deskOf("r1")).toMatchObject({ workrooms: "wf", book: "b1", pages: 3 })
  expect(deskOf("r1").forAi).toContain("is b1, with 3 pages: read it with read_book.")
})

test("参加の文は、ページが 1 枚なら単数で、ブックが無ければページを足すアクションを伝える", () => {
  expect(deskOf("r2").forAi).toContain("is b2, with 1 page: read it with read_book.")
  expect(deskOf("r3")).toMatchObject({ workrooms: "wf", book: undefined, pages: 0 })
  expect(deskOf("r3").forAi).toContain("has no pages yet: add one with @matomezu/base:worker-page-add.")
  expect(deskOf("r3").forAi).toContain(`read_folder with folder "${MY_WORKDESK}"`)
  // 今の作業の相談はワーカーブックへ、と伝える
  expect(deskOf("r3").forAi).toContain(WRITE_IN_WORKER_BOOK)
})
