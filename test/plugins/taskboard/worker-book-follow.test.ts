// ワーカーブックの片付けと常駐メッセージ（フォローステップ）: 部屋を消すとワークルーム自身のブックを、チケットを消すとそのチケットのブックを完全に消し、
// チケットを完了するとそのブックのアノテーションを消す（ブックは残る）。カレントチケットが変わったワークルームと、担当に別のワークルームが入ったチケットの前からの担当へ知らせる
import { expect, test } from "bun:test"
import { type Actor, USER } from "../../../web/src/core/actor"
import { backyardIdOf, HOME_ID } from "../../../web/src/core/folders"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { REMOVED, withCounters, withRecords } from "../../../web/src/core/records"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import type { Project } from "../../../web/src/plugins/taskboard/project"
import { drawingPage, testBook } from "../../lineup"
import { CORE_CATALOG, libraryWith } from "../../support"

const A = (id: string) => `@matomezu/taskboard:${id}`
const WORKROOM = "@matomezu/base:workroom"
const TICKET = A("ticket")
const YARD = backyardIdOf(TICKETS_HISTORY.id)
type Done = Extract<PerformedIn, { ok: true }> & { result: Record<string, unknown> }
const ai = (workroom: string): Actor => ({ kind: "ai", workroom: { id: workroom } })
const note = { id: "n1", kind: "@matomezu/base:note", anchors: [], text: "x", by: "user", at: "t" } as never

function board() {
  let w: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
  let n = 0
  const act = (actor: Actor, action: string, args: unknown, on?: { record: string }) => {
    const done = performIn(w, action.includes(":") ? action : A(action), args, on, {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "en",
      newId: () => `n${++n}`,
      now: "2026-11-23T00:00:00.000Z",
      today: "2026-11-23",
      actor,
    })
    if (!done.ok) throw new Error(`${action}: ${JSON.stringify(done)}`)
    w = {
      ...w,
      ...(done.records ? { records: withRecords(w.records, done.records) } : {}),
      counters: withCounters(w.counters, done.counters),
    }
    return done as Done
  }
  const user = (action: string, args: unknown, on?: { record: string }) => act(USER, action, args, on)
  const room = (name: string) => user("@matomezu/base:workroom-add", { name, bird: "inko" }).result.workroom as string
  user("project-add", {})
  const project = () => Object.values(w.records[A("project")] ?? {})[0] as Project
  const ticket = (args: Record<string, unknown> = {}) =>
    user("ticket-add", { project: project().id, name: "t", ...args }).result.ticket as string
  // tickets-history に、key ごとのブック（ページ 1 枚。そのページに伝言 1 つ）を置く
  const yard = (books: readonly { id: string; key: { subject: string; id: string } }[]) => {
    const library = libraryWith(books.map(b => testBook(b.id, b.id, [drawingPage(`${b.id}-p`)])))
    w = {
      ...w,
      pages: library.pages,
      folders: {
        ...library.folders,
        [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [] },
        [YARD]: {
          folderRole: "backyard",
          id: YARD,
          backyard: TICKETS_HISTORY.id,
          lineup: books.map(b => ({ kind: "book" as const, id: b.id, workKey: b.key })),
        },
      },
      annotations: Object.fromEntries(books.map(b => [`${b.id}-p`, [note]])),
    }
  }
  return { act, user, room, ticket, yard }
}

test("部屋を消すと、そのワークルーム自身のブックを完全に消し、チケットのブックは残す", () => {
  const b = board()
  const r = b.room("r")
  const t = b.ticket()
  b.yard([
    { id: "own", key: { subject: WORKROOM, id: r } },
    { id: "tk", key: { subject: TICKET, id: t } },
  ])
  const done = b.user("@matomezu/base:workroom-remove", {}, { record: r })
  expect(done.changes?.folders.own).toBe(REMOVED)
  expect(done.changes?.pages["own-p"]).toBe(REMOVED)
  expect(done.changes?.folders.tk).toBeUndefined()
  expect(done.changes?.folders[YARD]).toMatchObject({ lineup: [{ id: "tk" }] })
  expect(done.annotations).toEqual({ "own-p": [] })
  expect(done.followedRows).toEqual(expect.arrayContaining(["own", "own-p"]))
})

test("チケットを完了するとそのブックのアノテーションを消し（ブックは残る）、チケットを消すとそのブックを完全に消す", () => {
  const b = board()
  const t = b.ticket()
  const u = b.ticket()
  b.yard([
    { id: "tk", key: { subject: TICKET, id: t } },
    { id: "uk", key: { subject: TICKET, id: u } },
  ])
  const completed = b.user("ticket-complete", {}, { record: t })
  expect(completed.changes).toBeUndefined()
  expect(completed.annotations).toEqual({ "tk-p": [] })
  const removed = b.user("ticket-remove", {}, { record: u })
  expect(removed.changes?.folders.uk).toBe(REMOVED)
  expect(removed.annotations).toEqual({ "uk-p": [] })
})

test("ブックの無いチケットとワークルームでは、何も片付けない", () => {
  const b = board()
  const r = b.room("r")
  const t = b.ticket()
  expect(b.user("ticket-complete", {}, { record: t }).annotations).toBeUndefined()
  expect(b.user("@matomezu/base:workroom-remove", {}, { record: r }).changes).toBeUndefined()
})

test("カレントチケットが変わるたびに、そのワークルームへ常駐メッセージを返す（担当に入れた・作業中のレーンへ動かした・抜けた）", () => {
  const b = board()
  const r = b.room("r")
  const t = b.ticket({ assignees: [r] })
  // 担当に入れて作業中のレーンに入ったので、カレントチケットになった
  const texts = (d: Done) => (d.hostMessages ?? []).filter(m => m.workroom === r).map(m => m.text)
  expect(texts(b.act(USER, "ticket-update", { name: "t2" }, { record: t }))).toEqual([])
  const left = b.act(ai(r), "ticket-leave", {}, { record: t })
  expect(texts(left)).toEqual([expect.stringContaining("no current ticket")])
  const started = b.act(ai(r), "ticket-start", {}, { record: t })
  expect(texts(started)).toEqual([expect.stringContaining("Your current ticket is now")])
})

test("担当に別のワークルームが入ったら、前からの担当へ知らせる（入ったワークルームには送らない）", () => {
  const b = board()
  const r = b.room("r")
  const s = b.room("s")
  const t = b.ticket({ assignees: [r] })
  const done = b.user("ticket-update", { assignees: [r, s] }, { record: t })
  const assigned = (done.hostMessages ?? []).filter(m => m.text.startsWith("Another workroom"))
  expect(assigned.map(m => m.workroom)).toEqual([r])
  expect(assigned[0]?.text).toContain(s)
})
