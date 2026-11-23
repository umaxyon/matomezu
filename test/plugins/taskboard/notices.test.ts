// カレントワークとチケットの担当の変わりの知らせ（常駐メッセージ）と、チケットの作業が終わったか（completesWork）。
// カレントチケットが変わったワークルームと、担当に別のワークルームが入ったチケットの前からの担当へ知らせる。完了のレーンに入ったときだけ作業が終わる
import { expect, test } from "bun:test"
import { type Actor, USER } from "../../../web/src/core/actor"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { withCounters, withRecords } from "../../../web/src/core/records"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { PROJECT, type Project } from "../../../web/src/plugins/taskboard/project"
import { TICKET } from "../../../web/src/plugins/taskboard/ticket/ticket"
import { CORE_CATALOG } from "../../support"

const A = (id: string) => `@matomezu/taskboard:${id}`
type Done = Extract<PerformedIn, { ok: true }> & { result: Record<string, unknown> }
const ai = (workroom: string): Actor => ({ kind: "ai", workroom: { id: workroom } })

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
  const project = () => Object.values(w.records[PROJECT.id] ?? {})[0] as Project
  const ticket = (args: Record<string, unknown> = {}) =>
    user("ticket-add", { project: project().id, name: "t", ...args }).result.ticket as string
  return { act, user, room, ticket, project }
}

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

test("チケットの作業は、完了のレーンに入ったときだけ終わる（作ったときに完了のレーンでも。完了のレーンの中で動いても終わらない）", () => {
  const project = { id: "p", doneLane: "done" }
  const read = (subject: string) => (subject === PROJECT.id ? project : "none")
  const ticket = (lane: string) => ({ id: "t", project: "p", lane })
  const ends = (before: unknown, after: unknown) => TICKET.completesWork?.(before, after, read) ?? false
  expect(ends(ticket("todo"), ticket("done"))).toBe(true)
  expect(ends("none", ticket("done"))).toBe(true)
  expect(ends(ticket("done"), ticket("done"))).toBe(false)
  expect(ends(ticket("todo"), ticket("doing"))).toBe(false)
  expect(TICKET.completesWorkReads?.("none", ticket("done"))).toEqual([{ subject: PROJECT.id, id: "p" }])
})
