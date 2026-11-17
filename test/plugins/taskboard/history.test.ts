// チケットのロック・担当・履歴・今のチケット（タスクボード）。書いた者はアクターから写し、履歴の題は列挙 history-topic の値

import { expect, test } from "bun:test"
import { type Actor, USER } from "../../../web/src/core/actor"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform"
import { withCounters, withRecords } from "../../../web/src/core/records"
import { CURRENT } from "../../../web/src/plugins/taskboard/current-ticket"
import { TICKET } from "../../../web/src/plugins/taskboard/ticket"
import { HISTORY, HISTORY_TOPIC } from "../../../web/src/plugins/taskboard/ticket-history"
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
      pages: {},
      folders: {},
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

test("今のチケットは、AI が自分のワークルームの分を宣言する。最初は on を省き、あとは on に自分の id。利用者は行えない", () => {
  const { user, as, table, room, ticket } = ready()
  const id = room("ひよこ")
  const other = room("ぴよ")
  expect(user(A("current-ticket-set"), { ticket }).ok).toBe(false)
  expect(as(ai(id), "current-ticket-set", { ticket: "nothing" }).ok).toBe(false)
  // 記録の無いワークルームを on.record で指すと、core が no-record で断る
  expect(as(ai(id), "current-ticket-set", { ticket }, { record: other })).toMatchObject({
    ok: false,
    reason: "no-record",
  })
  // ワークルームの id でない id を on.record に付けたら、断りが種類の説明（id はワークルームの id）と一覧の引き方を言う
  const wrong = as(ai(id), "current-ticket-set", { ticket }, { record: "a-participant" }) as { detail?: string }
  expect(wrong).toMatchObject({ ok: false, reason: "no-record" })
  expect(wrong.detail).toContain("The record's id is the workroom's id")
  expect(wrong.detail).toContain(`read_records with kind ${CURRENT.id}`)
  expect(as(ai(id), "current-ticket-set", { ticket })).toMatchObject({ ok: true, result: { current: id } })
  expect(as(ai(id), "current-ticket-set", { ticket }).records?.[0]?.record).toEqual({
    id,
    ticket,
    at: "2026-11-12T00:00:00.000Z",
  })
  expect(as(ai(id), "current-ticket-set", { ticket: "none" }).ok).toBe(true)
  expect(table(CURRENT.id)).toEqual([])
})

test("管理者のワークルームの AI だけが、ほかのワークルームの今のチケットを決め、そのワークルームの AI に AI 間メッセージを送る。記録の無いワークルームは workroom（id か名前）で作り、記録があれば on.record で指す", () => {
  const { user, act, table, room, ticket } = completing()
  const admin = room("あ")
  const other = room("い")
  const set = (actor: string, args: object, on?: On) => act(ai(actor), "current-ticket-set", { ticket, ...args }, on)
  const declined = (done: Done) => (done as { detail?: string }).detail ?? ""
  // 印がまだ無いとき（admin-set を一度も行っていない）は断る
  expect(declined(set(admin, { workroom: other }))).toContain("administrator")
  expect(user("@matomezu/base:admin-set", { workroom: admin }).ok).toBe(true)
  // 印がほかのワークルームを指す AI は断られる。自分の分は名前で指してもよい
  expect(declined(set(other, { workroom: admin }))).toContain("administrator")
  const own = set(other, { workroom: "い" })
  expect(own).toMatchObject({ ok: true, result: { current: other } })
  // 自分の分では AI 間メッセージを送らない
  expect((own as { aiMessages?: unknown }).aiMessages).toBeUndefined()
  expect(table(CURRENT.id)).toEqual([{ id: other, ticket, at: "2026-11-12T00:00:00.000Z" }])
  // 管理者は、まだ宣言していないワークルームの分を作り、記録のあるワークルームの分を on.record で変える
  const third = room("う")
  // ほかのワークルームの分を決めたら、そのワークルームの AI に AI 間メッセージを送る（宛先はワークルームの id）
  expect(set(admin, { workroom: "う" })).toMatchObject({
    ok: true,
    result: { current: third },
    aiMessages: [{ workroom: third, text: `The administrator set your workroom's current ticket to "t" (${ticket}).` }],
  })
  expect(set(admin, { ticket: "none" }, { record: other }).ok).toBe(true)
  expect(table(CURRENT.id)).toContainEqual({ id: other, ticket: "none", at: "2026-11-12T00:00:00.000Z" })
  // 管理者でない AI は、ほかのワークルームの記録を on.record で変えられない
  expect(declined(set(third, {}, { record: other }))).toContain("administrator")
  // 無いワークルーム・on と workroom の両方は断る
  expect(declined(set(admin, { workroom: "え" }))).toContain('the workroom "え" is not there')
  expect(declined(set(admin, { workroom: other }, { record: other }))).toContain("leave workroom out")
  // 記録のあるワークルームを、on を省いて作ろうとすると断られる
  expect(set(admin, { workroom: other }).ok).toBe(false)
})

test("履歴の題は列挙 history-topic の値（状況・プラン・質問・本文更新・完了）。値の data は色の役割で、質問だけ利用者への質問（asksUser）、本文更新と完了だけ文を持たない（textless）", () => {
  const values = [...CORE_CATALOG.enumValues.values()].filter(v => v.enum === HISTORY_TOPIC.id)
  expect(values.map(v => v.id)).toEqual([
    A("topic-status"),
    A("topic-plan"),
    A("topic-question"),
    A("topic-body"),
    A("topic-complete"),
  ])
  expect(values.map(v => v.data)).toEqual([
    { color: "primary" },
    { color: "secondary" },
    { color: "warn", asksUser: true },
    { color: "muted", textless: true },
    { color: "success", textless: true },
  ])
})

test("本文更新の題は文を持たなくてよい。ほかの題は文が空だと断る", () => {
  const { user, table, ticket } = ready()
  expect(user(A(LOG), { ticket, topic: A("topic-body"), text: "" }).ok).toBe(true)
  expect(table(HISTORY.id)[0]).toMatchObject({ topic: A("topic-body"), text: "", by: { kind: "user" } })
  expect(user(A(LOG), { ticket, topic: A("topic-status"), text: "  " }).ok).toBe(false)
})

// チケットの完了（ticket-complete）: レーン・担当・今のチケット・チケット履歴が 1 回で、全部そろって変わる。
// store は利用者だけが行うので、AI としても行うここだけは、世界を自分で持って結果を当てていく
function completing() {
  let w: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
  let n = 0
  const act = (actor: Actor, action: string, args: unknown, on?: On) => {
    const done = performIn(w, action.includes(":") ? action : A(action), args, on, {
      catalog: CORE_CATALOG,
      controlCenter: "@matomezu/control-center:control-center" as never,
      lang: "ja",
      newId: () => `n${++n}`,
      now: "2026-11-12T00:00:00.000Z",
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
  const table = (kind: string) => Object.values(w.records[kind] ?? {}) as Record<string, unknown>[]
  const room = (name: string) =>
    (user("@matomezu/base:workroom-add", { name, bird: "inko" }) as Done & { result: { workroom: string } }).result
      .workroom
  user("project-add", {})
  const projectRecord = () =>
    table(PROJECT)[0] as {
      id: string
      doneLane?: string
      lanes: { kind: string; id?: string; name?: string; prompt?: string }[]
    }
  const project = projectRecord().id
  const ticket = (user("ticket-add", { project, name: "t" }) as Done & { result: { ticket: string } }).result.ticket
  const laneNamed = (name: string) => projectRecord().lanes.find(l => l.name === name)?.id as string
  return { act, user, table, room, project, ticket, projectRecord, laneNamed }
}

test("完了にすると、チケットは完了のレーンへ移り、担当が外れ、指している全部のワークルームの今のチケットが none になり、チケット履歴に完了の行（外した担当つき）が足される。1 回で全部", () => {
  const { user, act, table, room, ticket, projectRecord } = completing()
  const a = room("あ")
  const b = room("い")
  user("ticket-update", { assignees: [a, b] }, { record: ticket })
  expect(act(ai(a), "current-ticket-set", { ticket }).ok).toBe(true)
  expect(act(ai(b), "current-ticket-set", { ticket }).ok).toBe(true)
  const done = user("ticket-complete", {}, { record: ticket })
  expect(done).toMatchObject({ ok: true, result: { lane: projectRecord().doneLane, released: [a, b] } })
  expect(((done.result?.cleared ?? []) as string[]).sort()).toEqual([a, b].sort())
  expect(table(TICKET.id)[0]).toMatchObject({ lane: projectRecord().doneLane, assignees: [] })
  expect(table(CURRENT.id).map(c => c.ticket)).toEqual(["none", "none"])
  expect(table(HISTORY.id)).toEqual([
    expect.objectContaining({ ticket, topic: A("topic-complete"), text: "", by: { kind: "user" }, released: [a, b] }),
  ])
})

test("完了は、完了のレーンの無いプロジェクトと、もう完了しているチケットは断る。完了のレーンへほかの道で入れることも、完了のチケットに担当を付けることも断る", () => {
  const { user, table, room, ticket, project, projectRecord, laneNamed } = completing()
  const a = room("あ")
  expect(projectRecord().doneLane).toBe(laneNamed("完了")) // 最初のプロジェクトの完了のレーンは、最初から決まっている
  // 完了のレーンへは、ticket-update でも ticket-add でも入れない
  expect(user("ticket-update", { lane: "完了" }, { record: ticket }).ok).toBe(false)
  expect(user("ticket-add", { project, name: "x", lane: "完了" }).ok).toBe(false)
  expect(table(TICKET.id)).toHaveLength(1)
  expect(user("ticket-complete", {}, { record: ticket }).ok).toBe(true)
  expect(user("ticket-complete", {}, { record: ticket }).ok).toBe(false) // もう完了している
  // 完了のレーンにいる間は担当を付けられない。出せば付けられる（担当は戻らない）
  expect(user("ticket-update", { assignees: [a] }, { record: ticket }).ok).toBe(false)
  expect(user("ticket-update", { name: "z" }, { record: ticket }).ok).toBe(true)
  expect(user("ticket-update", { lane: laneNamed("未着手") }, { record: ticket }).ok).toBe(true)
  expect((table(TICKET.id)[0] as { assignees: string[] }).assignees).toEqual([])
  expect(user("ticket-update", { assignees: [a] }, { record: ticket }).ok).toBe(true)
  // 完了のレーンが無いプロジェクトでは完了できない
  expect(user("project-update", { doneLane: "none" }, { record: project }).ok).toBe(true)
  expect(user("ticket-complete", {}, { record: ticket }).ok).toBe(false)
})

test("完了のレーンのチケットは、今のチケットに宣言できない", () => {
  const { user, act, room, ticket } = completing()
  const a = room("あ")
  expect(act(ai(a), "current-ticket-set", { ticket }).ok).toBe(true)
  user("ticket-complete", {}, { record: ticket })
  expect(act(ai(a), "current-ticket-set", { ticket }, { record: a }).ok).toBe(false)
  expect(act(ai(a), "current-ticket-set", { ticket: "none" }, { record: a }).ok).toBe(true)
})

test("完了のレーンを替えるときは、新しいレーンのチケットに担当がいれば断り、今のチケットに指されていれば同じ 1 回で none にする。名前でも指せ、無いレーンは断る。レーンを消すと none になる", () => {
  const { user, act, table, room, ticket, project, projectRecord, laneNamed } = completing()
  const a = room("あ")
  const todo = laneNamed("未着手")
  user("ticket-update", { lane: todo, assignees: [a] }, { record: ticket })
  const set = (doneLane: string) => user("project-update", { doneLane }, { record: project })
  expect(set("未着手").ok).toBe(false) // 担当のいるチケットがある
  user("ticket-update", { assignees: [] }, { record: ticket })
  expect(act(ai(a), "current-ticket-set", { ticket }).ok).toBe(true)
  expect(set("nothing").ok).toBe(false)
  expect(set("未着手").ok).toBe(true) // 今のチケットに指されていても通り、同じ 1 回で none になる
  expect(table(CURRENT.id).map(c => c.ticket)).toEqual(["none"])
  expect(projectRecord().doneLane).toBe(todo)
  // 完了のレーンを並びから省くと、完了のレーンは none になる
  const rest = projectRecord().lanes.filter(l => l.id !== todo)
  expect(user("project-update", { lanes: rest }, { record: project }).ok).toBe(true)
  expect(projectRecord().doneLane).toBeUndefined()
})

test("完了の行は、チケット履歴に直に書けない（ticket-complete だけが書く）", () => {
  const { user, ticket, table } = completing()
  expect(user("ticket-history-add", { ticket, topic: A("topic-complete"), text: "" }).ok).toBe(false)
  expect(table(HISTORY.id)).toEqual([])
})
