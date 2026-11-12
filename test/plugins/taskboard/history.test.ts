// チケットのロック・担当・履歴・今のチケット（タスクボード）。書いた者はアクターから写し、履歴の題は列挙 history-topic の値

import { expect, test } from "bun:test"
import type { Actor } from "../../../web/src/core/actor"
import { performIn } from "../../../web/src/core/perform"
import { CURRENT } from "../../../web/src/plugins/taskboard/current"
import { HISTORY, HISTORY_TOPIC } from "../../../web/src/plugins/taskboard/history"
import { TICKET } from "../../../web/src/plugins/taskboard/ticket"
import { CORE_CATALOG, newStore } from "../../support"

const LOG = "ticket-history-add"
const A = (id: string) => `@matomezu/taskboard:${id}`
const PROJECT = "@matomezu/taskboard:project"
type Done = {
  ok: boolean
  reason?: string
  result?: Record<string, unknown>
  records?: readonly { record: Record<string, unknown> }[]
}
type On = { record: string }

function ready() {
  const store = newStore()
  const user = (action: string, args: unknown, on?: On) =>
    (store.actions.perform as unknown as (id: string, a: unknown, o?: On) => Done)(action, args, on)
  const room = (name: string) =>
    (user("@matomezu/base:workroom-add", { name, bird: "inko" }) as Done & { result: { workroom: string } }).result
      .workroom
  const as = (actor: Actor, action: string, args: unknown, on?: On) => {
    const s = store.state.getState()
    const world = {
      books: {},
      settings: s.settings,
      annotations: {},
      records: s.records,
      counters: s.counters,
    }
    return performIn(world, A(action), args, on, {
      catalog: CORE_CATALOG,
      controlCenter: "@matomezu/control-center:control-center" as never,
      lang: "ja",
      newId: () => `n${Math.random()}`,
      now: "2026-11-12T00:00:00.000Z",
      actor,
    }) as unknown as Done
  }
  const table = (kind: string) => Object.values(store.state.getState().records[kind] ?? {}) as Record<string, unknown>[]
  user(A("project-add"), {})
  const project = (table(PROJECT)[0] as { id: string }).id
  const ticket = (user(A("ticket-add"), { project, name: "t" }) as Done & { result: { ticket: string } }).result.ticket
  return { store, user, room, as, table, project, ticket }
}
const ai = (workroom: string): Actor => ({ kind: "ai", workroom: { id: workroom } })

test("履歴の行を足すと、書いた者（アクターの写し）と時点が付く。題は列挙の値だけ。履歴を書いても、チケットの最終更新は動かない", () => {
  const { as, table, room, ticket, user } = ready()
  const id = room("ひよこ")
  const before = (table(TICKET.id)[0] as { updatedAt: string }).updatedAt
  expect(as(ai(id), LOG, { ticket, topic: A("topic-status"), text: "進んでいます" }).ok).toBe(true)
  expect(as(ai(id), LOG, { ticket, topic: "nothing", text: "x" }).ok).toBe(false)
  expect(as(ai(id), LOG, { ticket: "nothing", topic: A("topic-plan"), text: "x" }).ok).toBe(false)
  expect(user(A(LOG), { ticket, topic: A("topic-question"), text: "どちらですか" }).ok).toBe(true)
  const lines = table(HISTORY.id)
  expect(lines).toHaveLength(1) // as() は store に写さないので、利用者の 1 行だけが入る
  expect(lines[0]).toMatchObject({ ticket, topic: A("topic-question"), by: { kind: "user" } })
  expect((table(TICKET.id)[0] as { updatedAt: string }).updatedAt).toBe(before)
})

test("AI の行の by は、入っているワークルームの名前・鳥の写し。ワークルームが無い AI は断る", () => {
  const { as, room, ticket } = ready()
  const id = room("ひよこ")
  const done = as(ai(id), LOG, { ticket, topic: A("topic-plan"), text: "計画" })
  expect(done.records?.[0]?.record).toMatchObject({
    by: { kind: "ai", workroom: { id, name: "ひよこ", bird: "inko" } },
    at: "2026-11-12T00:00:00.000Z",
  })
  expect(as(ai("nothing"), LOG, { ticket, topic: A("topic-plan"), text: "計画" }).ok).toBe(false)
})

test("起票した者はチケットに残る。担当は、あるワークルームだけを重ねずに付けられ、同じ並びなら最終更新は動かない", () => {
  const { user, table, room, ticket } = ready()
  const a = room("あ")
  const b = room("い")
  expect((table(TICKET.id)[0] as { createdBy: unknown }).createdBy).toEqual({ kind: "user" })
  expect(user(A("ticket-update"), { assignees: [a, a] }, { record: ticket }).ok).toBe(false)
  expect(user(A("ticket-update"), { assignees: ["nothing"] }, { record: ticket }).ok).toBe(false)
  expect(user(A("ticket-update"), { assignees: [b, a] }, { record: ticket }).ok).toBe(true)
  expect((table(TICKET.id)[0] as { assignees: string[] }).assignees).toEqual([b, a])
})

test("ロック中のチケットは直せず消せない。AI は掛けられるが外せない。履歴は足せる", () => {
  const { user, as, table, room, ticket } = ready()
  const id = room("ひよこ")
  expect(as(ai(id), "ticket-lock", {}, { record: ticket }).ok).toBe(true)
  expect(user(A("ticket-lock"), {}, { record: ticket }).ok).toBe(true)
  expect(user(A("ticket-update"), { name: "z" }, { record: ticket }).ok).toBe(false)
  expect(user(A("ticket-remove"), {}, { record: ticket }).ok).toBe(false)
  expect(as(ai(id), "ticket-unlock", {}, { record: ticket })).toMatchObject({ ok: false, reason: "not-allowed" })
  expect(user(A(LOG), { ticket, topic: A("topic-status"), text: "x" }).ok).toBe(true)
  expect(table(HISTORY.id)).toHaveLength(1)
  expect(user(A("ticket-unlock"), {}, { record: ticket }).ok).toBe(true)
  expect(user(A("ticket-update"), { name: "z" }, { record: ticket }).ok).toBe(true)
})

test("今のチケットは、AI が自分のワークルームの分だけ宣言する。最初は on を省き、あとは on に自分の id。利用者は行えない", () => {
  const { user, as, table, room, ticket } = ready()
  const id = room("ひよこ")
  const other = room("ぴよ")
  expect(user(A("current-ticket-set"), { ticket }).ok).toBe(false)
  expect(as(ai(id), "current-ticket-set", { ticket: "nothing" }).ok).toBe(false)
  expect(as(ai(id), "current-ticket-set", { ticket }, { record: other }).ok).toBe(false)
  expect(as(ai(id), "current-ticket-set", { ticket })).toMatchObject({ ok: true, result: { current: id } })
  expect(as(ai(id), "current-ticket-set", { ticket }).records?.[0]?.record).toEqual({
    id,
    ticket,
    at: "2026-11-12T00:00:00.000Z",
  })
  expect(as(ai(id), "current-ticket-set", { ticket: "none" }).ok).toBe(true)
  expect(table(CURRENT.id)).toEqual([])
})

test("履歴の題は列挙 history-topic の値（状況・プラン・質問・本文更新）。値の data は色の役割で、質問だけ利用者への質問（asksUser）、本文更新だけ文を持たない（textless）", () => {
  const values = [...CORE_CATALOG.enumValues.values()].filter(v => v.enum === HISTORY_TOPIC.id)
  expect(values.map(v => v.id)).toEqual([A("topic-status"), A("topic-plan"), A("topic-question"), A("topic-body")])
  expect(values.map(v => v.data)).toEqual([
    { color: "primary" },
    { color: "secondary" },
    { color: "warn", asksUser: true },
    { color: "muted", textless: true },
  ])
})

test("本文更新の題は文を持たなくてよい。ほかの題は文が空だと断る", () => {
  const { user, table, ticket } = ready()
  expect(user(A(LOG), { ticket, topic: A("topic-body"), text: "" }).ok).toBe(true)
  expect(table(HISTORY.id)[0]).toMatchObject({ topic: A("topic-body"), text: "", by: { kind: "user" } })
  expect(user(A(LOG), { ticket, topic: A("topic-status"), text: "  " }).ok).toBe(false)
})
