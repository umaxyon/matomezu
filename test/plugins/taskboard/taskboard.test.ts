// タスクボード（プロジェクトとチケット。レコード）: 作る・直す・断る、AI の権限、番号、閉じたプロジェクト

import { expect, test } from "bun:test"
import { AI, type USER } from "../../../web/src/core/actor"
import { performIn } from "../../../web/src/core/perform"
import { PROJECT } from "../../../web/src/plugins/taskboard/project"
import { TICKET } from "../../../web/src/plugins/taskboard/ticket"
import { CORE_CATALOG, newStore } from "../../support"

const P = PROJECT.id
const T = TICKET.id
const A = (id: string) => `@matomezu/taskboard:${id}`

type Done = { ok: boolean; reason?: string; result?: Record<string, unknown> }
type Project = {
  id: string
  prefix: string
  closed: boolean
  lanes: { kind: string; id?: string; name?: string }[]
  tags: { id: string; name: string; enabled: boolean }[]
}

function ready() {
  const store = newStore()
  const ctx = (actor: typeof AI | typeof USER) => ({
    catalog: CORE_CATALOG,
    controlCenter: "@matomezu/control-center:control-center" as never,
    lang: "ja" as const,
    newId: () => `n${Math.random()}`,
    now: "2026-11-12T00:00:00.000Z",
    actor,
  })
  const run = (actor: typeof AI | typeof USER, action: string, args: unknown, on?: { record: string }) => {
    const s = store.state.getState()
    const world = {
      books: {},
      settings: s.settings,
      annotations: {},
      records: s.records,
      counters: s.counters,
    }
    return performIn(world, A(action), args, on, ctx(actor)) as unknown as Done
  }
  // 利用者として行い、結果を store に写す（store.actions.perform は利用者）
  const user = (action: string, args: unknown, on?: { record: string }) =>
    (store.actions.perform as unknown as (id: string, a: unknown, o?: { record: string }) => Done)(A(action), args, on)
  const projects = () => Object.values(store.state.getState().records[P] ?? {}) as Project[]
  const tickets = () =>
    Object.values(store.state.getState().records[T] ?? {}) as {
      id: string
      number: number
      lane: string
      tag: string
      priority: string
      project: string
    }[]
  return { store, run, user, projects, tickets }
}

test("プロジェクトを作ると、テンプレのレーン（未着手・作業中・完了と未分類）とタグ（タスク・バグ）が入る", () => {
  const { user, projects } = ready()
  expect(user("project-add", {}).ok).toBe(true)
  const [p] = projects()
  expect(p?.prefix).toBe("T-")
  expect(p?.lanes.map(l => l.name ?? l.kind)).toEqual(["未着手", "作業中", "完了", "unsorted"])
  expect(p?.tags.map(t => t.name)).toEqual(["タスク", "バグ"])
})

test("チケットプレフィクスは、大文字小文字を分けずに、プロジェクトをまたいで重ならない", () => {
  const { user, projects } = ready()
  user("project-add", { prefix: "AB-" })
  expect(user("project-add", { prefix: "ab-" }).ok).toBe(false)
  expect(projects()).toHaveLength(1)
})

test("AI はプロジェクトを作る・チケットを足す・直すはできるが、プロジェクトを直す・閉じる・開け直す・チケットを消すはできない", () => {
  const { user, run, projects, tickets } = ready()
  expect(run(AI, "project-add", { prefix: "X-" }).ok).toBe(true)
  user("project-add", { prefix: "Y-" })
  const p = projects().find(x => x.prefix === "Y-") as Project
  const added = user("ticket-add", { project: p.id, name: "a" })
  expect(added.ok).toBe(true)
  const t = tickets()[0]?.id as string
  expect(run(AI, "ticket-update", { name: "b" }, { record: t }).ok).toBe(true)
  for (const [a, args, on] of [
    ["project-update", { name: "z" }, p.id],
    ["project-close", {}, p.id],
    ["project-reopen", {}, p.id],
    ["ticket-remove", {}, t],
  ] as const)
    expect(run(AI, a, args, { record: on })).toMatchObject({ ok: false, reason: "not-allowed" })
})

test("チケットの番号はプロジェクトごとに続き、消しても使い回さない。レーンを省くと未分類、優先度は中", () => {
  const { user, projects, tickets } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  user("ticket-add", { project: p.id, name: "a" })
  user("ticket-add", { project: p.id, name: "b" })
  user("ticket-remove", {}, { record: tickets()[1]?.id as string })
  user("ticket-add", { project: p.id, name: "c" })
  expect(tickets().map(t => t.number)).toEqual([1, 3])
  expect(tickets()[0]).toMatchObject({ lane: "unsorted", tag: "none", priority: "medium" })
})

test("チケットを足すとき、無いレーン・無いタグ・使わないタグは断る", () => {
  const { user, projects, tickets } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  expect(user("ticket-add", { project: p.id, name: "a", lane: "nothing" }).ok).toBe(false)
  expect(user("ticket-add", { project: p.id, name: "a", tag: "nothing" }).ok).toBe(false)
  const lane = p.lanes[0]?.id as string
  const tag = p.tags[0]?.id as string
  expect(user("ticket-add", { project: p.id, name: "a", lane, tag }).ok).toBe(true)
  const tags = p.tags.map((t, i) => ({ ...t, enabled: i !== 0 }))
  expect(
    user("project-update", { tags: tags.map(t => ({ ...t, color: "primary", prompt: "" })) }, { record: p.id }).ok,
  ).toBe(true)
  expect(user("ticket-add", { project: p.id, name: "b", tag }).ok).toBe(false)
  expect(tickets()).toHaveLength(1)
})

test("閉じたプロジェクトにはチケットを足せないが、あるチケットは直せる。開け直すと足せる", () => {
  const { user, projects, tickets } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  user("ticket-add", { project: p.id, name: "a" })
  user("project-close", {}, { record: p.id })
  expect(user("ticket-add", { project: p.id, name: "b" }).ok).toBe(false)
  expect(user("ticket-update", { name: "c" }, { record: tickets()[0]?.id as string }).ok).toBe(true)
  user("project-reopen", {}, { record: p.id })
  expect(user("ticket-add", { project: p.id, name: "b" }).ok).toBe(true)
})
