// カレントワーク: チケットのアクションが同じトランザクションで直す・ticket-start で取り替える・ticket-leave で抜ける。
// 見せる側の判定（currentTicketOf・作業の様子）は、古くなったカレントワークを外す
import { expect, test } from "bun:test"
import { type Actor, USER } from "../../../web/src/core/actor"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { withCounters, withRecords } from "../../../web/src/core/records"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { workroomActivityOf } from "../../../web/src/plugins/base/participant/activity"
import { CURRENT_WORK, currentTicketOf } from "../../../web/src/plugins/taskboard/current-work"
import type { Project } from "../../../web/src/plugins/taskboard/project"
import { TICKET, type Ticket } from "../../../web/src/plugins/taskboard/ticket"
import { CORE_CATALOG } from "../../support"

const A = (id: string) => `@matomezu/taskboard:${id}`
type Done = { ok: boolean; reason?: string; detail?: string; result?: Record<string, unknown> }
type On = { record: string }
const ai = (workroom: string): Actor => ({ kind: "ai", workroom: { id: workroom } })

function board() {
  let w: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
  let n = 0
  const act = (actor: Actor, action: string, args: unknown, on?: On) => {
    const done = performIn(w, action.includes(":") ? action : A(action), args, on, {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "ja",
      newId: () => `n${++n}`,
      now: "2026-11-21T00:00:00.000Z",
      today: "2026-11-21",
      actor,
    }) as PerformedIn
    if (done.ok)
      w = {
        ...w,
        ...(done.records ? { records: withRecords(w.records, done.records) } : {}),
        counters: withCounters(w.counters, done.counters),
      }
    return done as unknown as Done
  }
  const user = (action: string, args: unknown, on?: On) => act(USER, action, args, on)
  const room = (name: string) =>
    (user("@matomezu/base:workroom-add", { name, bird: "inko" }) as Done & { result: { workroom: string } }).result
      .workroom
  user("project-add", {})
  const projectRecord = () => Object.values(w.records[A("project")] ?? {})[0] as Project
  const project = projectRecord().id
  const lane = (working: boolean) =>
    projectRecord().lanes.flatMap(l =>
      l.kind === "lane" && (l.working === true) === working && l.id !== projectRecord().doneLane ? [l.id] : [],
    )[0] as string
  const doing = lane(true)
  const todo = lane(false)
  const add = (args: Record<string, unknown> = {}) =>
    (user("ticket-add", { project, name: "t", ...args }) as Done & { result: { ticket: string } }).result.ticket
  // ワークルーム room のカレントワークが指すチケット（レコードが無ければ none）
  const work = (room: string) =>
    (w.records[CURRENT_WORK.id]?.[room] as { ticket: string } | undefined)?.ticket ?? "none"
  const ticketRecord = (id: string) => w.records[TICKET.id]?.[id] as Ticket
  return { act, user, room, project, doing, todo, add, work, ticketRecord, world: () => w }
}

test("カレントワークが none のワークルームは、作業中のレーンのチケットの担当に入ると、そのチケットがカレントワークになる。レーンから出ると none", () => {
  const { user, room, doing, todo, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  expect(work(a)).toBe(t1)
  user("ticket-update", { lane: todo }, { record: t1 })
  expect(work(a)).toBe("none")
  // 作業中のレーンへ戻すと、また入る
  user("ticket-update", { lane: doing }, { record: t1 })
  expect(work(a)).toBe(t1)
  // 担当から外すと none
  user("ticket-update", { assignees: [] }, { record: t1 })
  expect(work(a)).toBe("none")
})

test("カレントワークのあるワークルームを、ほかのチケットに当てても入れ替わらない（当てられているだけ）", () => {
  const { user, room, doing, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const t2 = add({ lane: doing })
  user("ticket-update", { assignees: [a] }, { record: t2 })
  expect(work(a)).toBe(t1)
})

test("ticket-start は取り替える: 作業中のレーンへ移し、担当に足し、前のチケットは当てられているだけに戻る", () => {
  const { act, room, doing, todo, add, work, ticketRecord } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const t2 = add({ lane: todo })
  const done = act(ai(a), "ticket-start", {}, { record: t2 })
  expect(done).toMatchObject({ ok: true, result: { workroom: a, previous: t1, lane: doing } })
  expect(work(a)).toBe(t2)
  expect(ticketRecord(t2)).toMatchObject({ lane: doing, assignees: [a] })
  expect(ticketRecord(t1).assignees).toEqual([a])
  // 同じチケットをもう一度始めても変わらない
  expect(act(ai(a), "ticket-start", {}, { record: t2 })).toMatchObject({ ok: true, result: { previous: t2 } })
})

test("ticket-start で作業中のレーンへ移ると、カレントワークが none のほかの担当にも入る", () => {
  const { act, room, todo, add, work } = board()
  const a = room("あ")
  const b = room("い")
  const t1 = add({ lane: todo, assignees: [b] })
  expect(work(b)).toBe("none")
  act(ai(a), "ticket-start", {}, { record: t1 })
  expect(work(a)).toBe(t1)
  expect(work(b)).toBe(t1)
})

test("ticket-start: AI は workroom を渡せない。利用者は workroom を名前でも選べ、無ければ断る", () => {
  const { act, user, room, add, work } = board()
  const a = room("あ")
  const t1 = add()
  expect(act(ai(a), "ticket-start", { workroom: a }, { record: t1 }).ok).toBe(false)
  expect(user("ticket-start", {}, { record: t1 }).ok).toBe(false)
  expect(user("ticket-start", { workroom: "あ" }, { record: t1 }).ok).toBe(true)
  expect(work(a)).toBe(t1)
})

test("ticket-leave は抜ける: カレントワークを none に。unassign で担当からも外す。どちらでもなければ断る", () => {
  const { act, room, doing, add, work, ticketRecord } = board()
  const a = room("あ")
  const b = room("い")
  const t1 = add({ lane: doing, assignees: [a, b] })
  expect(act(ai(b), "ticket-leave", {}, { record: t1 })).toMatchObject({
    ok: true,
    result: { left: true, unassigned: false },
  })
  expect(work(b)).toBe("none")
  expect(ticketRecord(t1).assignees).toEqual([a, b])
  // 抜けたあと、ほかの変更で勝手に戻らない
  act(ai(a), "ticket-update", { name: "u" }, { record: t1 })
  expect(work(b)).toBe("none")
  expect(act(ai(b), "ticket-leave", { unassign: true }, { record: t1 })).toMatchObject({
    ok: true,
    result: { left: false, unassigned: true },
  })
  expect(ticketRecord(t1).assignees).toEqual([a])
  expect(work(a)).toBe(t1)
  expect(act(ai(b), "ticket-leave", {}, { record: t1 }).ok).toBe(false)
})

test("完了・削除すると、そのチケットを指すカレントワークは全部 none（同じトランザクション）", () => {
  const { user, room, doing, add, work } = board()
  const a = room("あ")
  const b = room("い")
  const t1 = add({ lane: doing, assignees: [a, b] })
  expect([work(a), work(b)]).toEqual([t1, t1])
  user("ticket-complete", {}, { record: t1 })
  expect([work(a), work(b)]).toEqual(["none", "none"])
  const t2 = add({ lane: doing, assignees: [a] })
  expect(work(a)).toBe(t2)
  user("ticket-remove", {}, { record: t2 })
  expect(work(a)).toBe("none")
})

test("見せる側の判定: 作業中の印を外したレーンのチケットを指すカレントワークは、カレントチケットにも作業中にもならない", () => {
  const { user, room, project, doing, add, world } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const records = () => world().records as Record<string, Record<string, unknown>>
  const current = () =>
    currentTicketOf(
      a,
      records()[CURRENT_WORK.id]?.[a] as { ticket: string } | undefined,
      id => records()[TICKET.id]?.[id] as Ticket | undefined,
      id => records()[A("project")]?.[id] as Project | undefined,
    )
  expect(current()?.ticket.id).toBe(t1)
  expect(workroomActivityOf(CORE_CATALOG, records(), a)).toBe("working")
  const p = records()[A("project")]?.[project] as Project
  user(
    "project-update",
    { lanes: p.lanes.map(l => (l.kind === "lane" ? { ...l, working: undefined } : l)) },
    { record: project },
  )
  expect(current()).toBeUndefined()
  expect(workroomActivityOf(CORE_CATALOG, records(), a)).toBe("idle")
})

test("ticket-start は、完了のチケットと、作業中のレーンが無いプロジェクトのチケットでは断る", () => {
  const { act, user, room, project, add, world } = board()
  const a = room("あ")
  const done = add()
  user("ticket-complete", {}, { record: done })
  expect(act(ai(a), "ticket-start", {}, { record: done }).ok).toBe(false)
  const p = world().records[A("project")]?.[project] as Project
  user(
    "project-update",
    { lanes: p.lanes.map(l => (l.kind === "lane" ? { ...l, working: undefined } : l)) },
    { record: project },
  )
  expect(act(ai(a), "ticket-start", {}, { record: add() }).ok).toBe(false)
})

test("今カレントにしているチケットに ticket-start をしても、何も書かない", () => {
  const { act, room, doing, add } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  const again = act(ai(a), "ticket-start", {}, { record: t1 }) as Done & { records?: readonly unknown[] }
  expect(again.ok).toBe(true)
  expect(again.records ?? []).toEqual([])
})

test("ロックしたチケットでは ticket-start も ticket-leave も断る（チケットのアクションとして同じ扱い）", () => {
  const { act, user, room, doing, add, work } = board()
  const a = room("あ")
  const t1 = add({ lane: doing, assignees: [a] })
  user("ticket-lock", {}, { record: t1 })
  expect(act(ai(a), "ticket-leave", {}, { record: t1 }).ok).toBe(false)
  expect(work(a)).toBe(t1)
  const t2 = add()
  user("ticket-lock", {}, { record: t2 })
  expect(act(ai(a), "ticket-start", {}, { record: t2 }).ok).toBe(false)
})
