// ワーカーブックを workKey で引く（participant/worker-book.ts の foundWorkerBookOf）: 無い・ページが 0・ページが在る（バインダの中も、並びの順）
import { expect, test } from "bun:test"
import { backyardIdOf, type Folder, type Folders } from "../../../web/src/core/folders"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { foundWorkerBookOf, NO_WORKER_BOOK } from "../../../web/src/plugins/base/participant/worker-book"

const YARD = backyardIdOf(TICKETS_HISTORY.id)
const T1 = { subject: "@matomezu/taskboard:ticket", id: "t1" }
const T2 = { subject: "@matomezu/taskboard:ticket", id: "t2" }
const T3 = { subject: "@matomezu/taskboard:ticket", id: "t3" }
const folders: Folders = {
  [YARD]: {
    folderRole: "backyard",
    id: YARD,
    backyard: TICKETS_HISTORY.id,
    lineup: [
      { kind: "book", id: "b1", workKey: T1 },
      { kind: "book", id: "b2", workKey: T2 },
    ],
  } as Folder,
  b1: { folderRole: "book", id: "b1", title: "M-0001", lineup: [] } as unknown as Folder,
  b2: {
    folderRole: "book",
    id: "b2",
    title: "M-0002",
    lineup: [
      { kind: "page", id: "p1" },
      { kind: "binder", id: "bd" },
      { kind: "page", id: "p3" },
    ],
  } as unknown as Folder,
  bd: {
    folderRole: "binder",
    id: "bd",
    title: "",
    pageType: "x",
    lineup: [{ kind: "page", id: "p2" }],
  } as unknown as Folder,
}

test("ブックが無ければ NO_WORKER_BOOK", () => {
  expect(foundWorkerBookOf(folders, T3)).toBe(NO_WORKER_BOOK)
})

test("ページの無いブックは、ページが空の在るブック", () => {
  expect(foundWorkerBookOf(folders, T1)).toEqual({ book: "b1", pages: [] })
})

test("ページはバインダの中も、並びの順に出す", () => {
  expect(foundWorkerBookOf(folders, T2)).toEqual({ book: "b2", pages: ["p1", "p2", "p3"] })
})
