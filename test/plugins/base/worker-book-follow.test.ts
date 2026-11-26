// ワーカーブックの片付けと名前（base のフォローステップ）: ワークルームが消えたらそのワークルーム自身のブックを完全に消す。
// 作業のレコード（completesWork を持つ種類。ここではテスト用の種類）が消えたらそのブックを完全に消し、作業が終わったらそのブックのアノテーションを消す
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../../web/src/core/actor"
import { backyardIdOf, HOME_ID } from "../../../web/src/core/folders"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { REMOVED } from "../../../web/src/core/records"
import { BUILTIN } from "../../../web/src/plugins"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { FOLLOW_WORK_ENDED, FOLLOW_WORK_RENAMED, FOLLOW_WORKROOM_BOOK } from "../../../web/src/plugins/base/participant"
import { assemble, defineBuiltin } from "../../../web/src/store/plugin"
import { drawingPage, testBook } from "../../lineup"
import { libraryWith } from "../../support"

const WORKROOM = "@matomezu/base:workroom"
const JOB = "@ex/job:job"
const CENTER = "@ex/job:center"
const CODE = "@ex/job:code"
const SWITCH = "@ex/job:switch"
const YARD = backyardIdOf(TICKETS_HISTORY.id)
const title = "@matomezu/base:Language" as never
const job = (id: string, over: Record<string, unknown>) =>
  ({ id: `@ex/job:${id}`, title, aiDescription: id, target: JOB, args: z.strictObject({}), ...over }) as never
// テスト用の作業のレコード: done になったら作業が終わる。短く呼ぶ名前は、ほかの種類 code のレコード c1 の code と id をつないだ物。
// 種類 switch のレコードが変わると、作業 j1 の名前が変わり得る（名前の依る code を、switch は返さない）
const JOB_PLUGIN = defineBuiltin({
  id: "@ex/job",
  subjects: [
    {
      id: JOB,
      title,
      aiDescription: "job",
      record: z.strictObject({ id: z.string(), done: z.boolean() }),
      completesWork: (before: unknown, after: unknown) =>
        (after as { done: boolean }).done && (before === "none" || !(before as { done: boolean }).done),
      workRecordName: (record: { id: string }, read: { record(s: string, id: string): unknown }) => {
        const code = read.record(CODE, "c1") as { code: string } | symbol
        return typeof code === "symbol" ? undefined : { label: `${code.code}${record.id}`, name: "job" }
      },
      workRecordNameReads: [CODE],
    },
    { id: CODE, title, aiDescription: "code", record: z.strictObject({ id: z.string(), code: z.string() }) },
    {
      id: SWITCH,
      title,
      aiDescription: "switch",
      record: z.strictObject({ id: z.string() }),
      workRecordsRenamedBy: () => [{ subject: JOB, id: "j1" }],
    },
  ],
  actions: [
    job("job-done", { run: (now: object) => ({ next: { ...now, done: true }, result: {} }) }),
    job("job-rename", { run: (now: object) => ({ next: { ...now }, result: {} }) }),
    job("job-remove", { run: () => ({ next: REMOVED, result: {} }) }),
    job("switch-flip", { target: SWITCH, run: (now: object) => ({ next: { ...now }, result: {} }) }),
  ],
  controlCenters: [{ id: CENTER, actions: [], subjects: "all" }],
} as never)
const catalog = assemble([...BUILTIN, JOB_PLUGIN], CENTER).catalog.core

// tickets-history に、ワークルーム r1 のブック own と、作業 j1 のブック jb（どちらもページ 1 枚。そのページに伝言 1 つ）
function yardWorld(): World {
  const library = libraryWith([
    testBook("own", "own", [drawingPage("own-p")]),
    testBook("jb", "jb", [drawingPage("jb-p")]),
  ])
  const note = { id: "n1", kind: "@matomezu/base:note", anchors: [], text: "x", by: "user", at: "t" }
  return {
    pages: library.pages,
    folders: {
      ...library.folders,
      [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [] },
      [YARD]: {
        folderRole: "backyard",
        id: YARD,
        backyard: TICKETS_HISTORY.id,
        lineup: [
          { kind: "book", id: "own", workKey: { subject: WORKROOM, id: "r1" } },
          { kind: "book", id: "jb", workKey: { subject: JOB, id: "j1" } },
        ],
      },
    } as never,
    settings: {},
    annotations: { "own-p": [note], "jb-p": [note] } as never,
    records: {
      [WORKROOM]: { r1: { id: "r1", name: "r1", bird: "inko", createdAt: "t" } },
      [JOB]: { j1: { id: "j1", done: false } },
      [CODE]: { c1: { id: "c1", code: "Q-" } },
      [SWITCH]: { s1: { id: "s1" } },
    },
    counters: {},
  }
}
const act = (action: string, on: string, args: unknown = {}) =>
  performIn(
    yardWorld(),
    action,
    args,
    { record: on },
    {
      catalog,
      controlCenter: CENTER,
      lang: "en",
      newId: () => "z",
      now: "2026-11-23T00:00:00.000Z",
      today: "2026-11-23",
      actor: USER,
    },
  ) as Extract<PerformedIn, { ok: true }>

test("base はワーカーブックを片付け、名前を直す 3 つのフォローステップを持ち、どれも tickets-history だけに行う", () => {
  expect([FOLLOW_WORKROOM_BOOK, FOLLOW_WORK_ENDED, FOLLOW_WORK_RENAMED].map(f => f.backyards)).toEqual([
    [TICKETS_HISTORY.id],
    [TICKETS_HISTORY.id],
    [TICKETS_HISTORY.id],
  ])
})

test("作業のレコードの名前が変わり得る変わりでは、名前の依るほかの種類も base が読み、ワーカーブックの名前を今の短く呼ぶ名前に直す", () => {
  const done = act("@ex/job:switch-flip", "s1")
  expect(done.changes?.folders.jb).toMatchObject({ title: "Q-j1" })
  expect(done.changes?.folders.own).toBeUndefined()
})

test("ワークルームを消すと、そのワークルーム自身のブックを完全に消し、作業のブックは残す", () => {
  const done = act("@matomezu/base:workroom-remove", "r1")
  expect(done.changes?.folders.own).toBe(REMOVED)
  expect(done.changes?.folders.jb).toBeUndefined()
  expect(done.annotations).toEqual({ "own-p": [] })
})

test("作業が終わるとそのブックのアノテーションだけを消し、作業のレコードを消すとそのブックを完全に消す。終わらない変わりでは何もしない", () => {
  const ended = act("@ex/job:job-done", "j1")
  expect([ended.changes, ended.annotations]).toEqual([undefined, { "jb-p": [] }])
  const removed = act("@ex/job:job-remove", "j1")
  expect(removed.changes?.folders.jb).toBe(REMOVED)
  expect(removed.changes?.folders.own).toBeUndefined()
  expect(act("@ex/job:job-rename", "j1").annotations).toBeUndefined()
})
