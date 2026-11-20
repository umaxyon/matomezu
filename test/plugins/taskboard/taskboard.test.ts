// タスクボード（プロジェクトとチケット。レコード）: 作る・直す・断る、AI の権限、番号、閉じたプロジェクト

import { expect, test } from "bun:test"
import { AI, USER } from "../../../web/src/core/actor"
import { performIn, permittedIn } from "../../../web/src/core/perform-world"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
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
  cardShows: { priority: boolean; volume: boolean }
}

function ready() {
  const store = newStore()
  const ctx = (actor: typeof AI | typeof USER) => ({
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER as never,
    lang: "ja" as const,
    newId: () => `n${Math.random()}`,
    now: "2026-11-12T00:00:00.000Z",
    today: "2026-11-12",
    actor,
  })
  const run = (actor: typeof AI | typeof USER, action: string, args: unknown, on?: { record: string }) => {
    const s = store.state.getState()
    const world = {
      pages: {},
      folders: {},
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
      tags: string[]
      priority: string
      volume: string
      updatedAt: string
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

test("AI はプロジェクトを作る・閉じる・開け直す・チケットを足す・直すはできるが、プロジェクトを直す・チケットを消すはできない", () => {
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
    ["ticket-remove", {}, t],
  ] as const)
    expect(run(AI, a, args, { record: on })).toMatchObject({ ok: false, reason: "not-allowed" })
  expect(run(AI, "project-close", {}, { record: p.id }).ok).toBe(true) // run は store に写さない
  user("project-close", {}, { record: p.id })
  expect(run(AI, "project-reopen", {}, { record: p.id }).ok).toBe(true)
})

test("チケットの番号はプロジェクトごとに続き、消しても使い回さない。レーンを省くと未分類、優先度は中、チケットボリュームは見積もっていない", () => {
  const { user, projects, tickets } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  user("ticket-add", { project: p.id, name: "a" })
  user("ticket-add", { project: p.id, name: "b" })
  user("ticket-remove", {}, { record: tickets()[1]?.id as string })
  user("ticket-add", { project: p.id, name: "c" })
  expect(tickets().map(t => t.number)).toEqual([1, 3])
  expect(tickets()[0]).toMatchObject({ lane: "unsorted", tags: [], priority: "medium", volume: "none" })
})

test("チケットボリュームは ticket-add で選べ、ticket-update で変えられる。同じチケットボリュームなら最終更新は進まない。段に無い値は断る", () => {
  const { user, projects, tickets } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  expect(user("ticket-add", { project: p.id, name: "a", volume: "l" }).ok).toBe(true)
  const t = tickets()[0]?.id as string
  expect(tickets()[0]?.volume).toBe("l")
  const at = tickets()[0]?.updatedAt
  expect(user("ticket-update", { volume: "l" }, { record: t }).ok).toBe(true)
  expect(tickets()[0]?.updatedAt).toBe(at as string)
  expect(user("ticket-update", { volume: "xs" }, { record: t }).ok).toBe(true)
  expect(tickets()[0]?.volume).toBe("xs")
  expect(user("ticket-update", { volume: "huge" }, { record: t }).ok).toBe(false)
  expect(user("ticket-add", { project: p.id, name: "b", volume: "5" }).ok).toBe(false)
})

test("チケットを足すとき、無いレーン・無いタグ・使わないタグは断る", () => {
  const { user, projects, tickets } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  expect(user("ticket-add", { project: p.id, name: "a", lane: "nothing" }).ok).toBe(false)
  expect(user("ticket-add", { project: p.id, name: "a", tags: ["nothing"] }).ok).toBe(false)
  const lane = p.lanes[0]?.id as string
  const tag = p.tags[0]?.id as string
  const bug = p.tags[1]?.id as string
  // 同じタグを 2 回（id と名前でも）は断る
  expect(user("ticket-add", { project: p.id, name: "a", tags: [tag, p.tags[0]?.name as string] }).ok).toBe(false)
  expect(user("ticket-add", { project: p.id, name: "a", lane, tags: [bug, tag] }).ok).toBe(true)
  expect(tickets()[0]?.tags).toEqual([bug, tag])
  const tags = p.tags.map((t, i) => ({ ...t, enabled: i !== 0 }))
  expect(
    user("project-update", { tags: tags.map(t => ({ ...t, color: "primary", prompt: "" })) }, { record: p.id }).ok,
  ).toBe(true)
  expect(user("ticket-add", { project: p.id, name: "b", tags: [tag] }).ok).toBe(false)
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

test("プロジェクトを直すと、id の無いレーン・タグは新しく入り、id のある物は残り、省いた物は消える", () => {
  const { user, projects } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  const [todo] = p.lanes
  const [task] = p.tags
  const done = user(
    "project-update",
    {
      name: "新しい名前",
      prefix: "NEW",
      lanes: [
        { kind: "unsorted", shown: true },
        { kind: "lane", id: todo?.id, name: "やる", prompt: "", cardSize: "inherit" },
        { kind: "lane", name: "見直し", prompt: "p", cardSize: "inherit" },
      ],
      tags: [
        { ...task, name: "仕事" },
        { name: "調べ物", color: "success", enabled: false, prompt: "" },
      ],
    },
    { record: p.id },
  )
  expect(done.ok).toBe(true)
  const q = projects()[0] as Project
  expect(q).toMatchObject({ prefix: "NEW" })
  expect(q.lanes.map(l => l.name ?? l.kind)).toEqual(["unsorted", "やる", "見直し"])
  expect(q.lanes[1]?.id).toBe(todo?.id)
  expect(q.lanes[2]?.id).toBeString()
  expect(q.tags.map(t => t.name)).toEqual(["仕事", "調べ物"])
  expect(q.tags[0]?.id).toBe(task?.id)
})

test("新しいプロジェクトのチケットカードは優先度とチケットボリュームを出す。cardShows の priority・volume を 1 つずつ変えられ、省けば今のまま", () => {
  const { user, projects } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  expect(p.cardShows).toEqual({ priority: true, volume: true })
  expect(user("project-update", { cardShows: { priority: false } }, { record: p.id }).ok).toBe(true)
  expect((projects()[0] as Project).cardShows).toEqual({ priority: false, volume: true })
  expect(user("project-update", { cardShows: { volume: false } }, { record: p.id }).ok).toBe(true)
  expect((projects()[0] as Project).cardShows).toEqual({ priority: false, volume: false })
  expect(user("project-update", { name: "別の名前" }, { record: p.id }).ok).toBe(true)
  expect(user("project-update", { cardShows: {} }, { record: p.id }).ok).toBe(true)
  expect((projects()[0] as Project).cardShows).toEqual({ priority: false, volume: false })
})

test("プロジェクトを直すとき、無い id・重なる名前（前後の空白を除いて）・未分類が 1 つでない並び・ほかのプロジェクトと重なるプレフィクス（大文字小文字を問わない）は断る", () => {
  const { user, projects } = ready()
  user("project-add", { prefix: "AB-" })
  user("project-add", { prefix: "C" })
  const p = projects().find(x => x.prefix === "C") as Project
  const lane = (name: string, id?: string) => ({
    kind: "lane",
    name,
    prompt: "",
    cardSize: "inherit",
    ...(id ? { id } : {}),
  })
  const tag = (name: string, id?: string) => ({
    name,
    color: "primary",
    enabled: true,
    prompt: "",
    ...(id ? { id } : {}),
  })
  const unsorted = { kind: "unsorted", shown: false }
  for (const args of [
    { lanes: [unsorted, lane("a", "nope")] },
    { tags: [tag("a", "nope")] },
    { lanes: [unsorted, lane("a"), lane(" a ")] },
    { tags: [tag("a"), tag("a ")] },
    { lanes: [lane("a")] },
    { lanes: [unsorted, unsorted, lane("a")] },
    { prefix: "ab-" },
    { prefix: "ABCD" },
    { prefix: "A--" },
  ])
    expect(user("project-update", args, { record: p.id }).ok).toBe(false)
  expect(projects().find(x => x.id === p.id)).toMatchObject({ prefix: "C" })
})

test("閉じたプロジェクトは直せない。開け直すと直せる", () => {
  const { user, projects } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  user("project-close", {}, { record: p.id })
  expect(user("project-update", { name: "z" }, { record: p.id }).ok).toBe(false)
  expect(user("project-reopen", {}, { record: p.id }).ok).toBe(true)
  expect(user("project-update", { name: "z" }, { record: p.id }).ok).toBe(true)
})

test("閉じたプロジェクトは、行う前の問いでも、開け直すほかは断る（画面は歯車を出さない）", () => {
  const { user, store, projects } = ready()
  user("project-add", {})
  const p = projects()[0] as Project
  user("project-close", {}, { record: p.id })
  const s = store.state.getState()
  const world = {
    pages: {},
    folders: {},
    settings: s.settings,
    annotations: {},
    records: s.records,
    counters: s.counters,
  }
  const asked = (action: string) =>
    permittedIn(
      world,
      A(action) as never,
      {} as never,
      { record: p.id },
      {
        catalog: CORE_CATALOG,
        controlCenter: BUILTIN_CONTROL_CENTER as never,
        actor: USER,
      },
    )
  expect(asked("project-update")).toMatchObject({ ok: false, reason: "denied" })
  expect(asked("project-reopen").ok).toBe(true)
})

test("ticket-add は、レーン・タグ・担当を名前でも指せ、担当も一度に付けられ、チケットプレフィクスを付けた番号（label） と解決した値を返す。無い名前は選べる一覧つきで断る", () => {
  const { user, projects, tickets, store } = ready()
  const addRoom = (name: string) =>
    (
      (store.actions.perform as unknown as (id: string, a: unknown) => Done)("@matomezu/base:workroom-add", {
        name,
        bird: "inko",
      }) as Done & {
        result: { workroom: string }
      }
    ).result.workroom
  const made = user("project-add", {}) as Done & {
    result: {
      project: string
      prefix: string
      lanes: { id: string; name: string }[]
      tags: { id: string; name: string }[]
    }
  }
  expect(made.result.prefix).toBe("T-")
  expect(made.result.lanes.map(l => l.name)).toEqual(["未着手", "作業中", "完了"])
  expect(made.result.tags.map(t => t.name)).toEqual(["タスク", "バグ"])
  const room = addRoom("ひよこ")
  const added = user("ticket-add", {
    project: made.result.project,
    name: "a",
    lane: "作業中",
    tags: ["バグ"],
    assignees: ["ひよこ"],
  }) as Done & {
    result: { label: string; lane: string; tags: string[]; assignees: string[] }
  }
  expect(added.result).toMatchObject({
    label: "T-0001",
    lane: made.result.lanes[1]?.id,
    tags: [made.result.tags[1]?.id],
    assignees: [room],
  })
  expect(tickets()[0]).toMatchObject({ lane: made.result.lanes[1]?.id, assignees: [room] })
  const refused = user("ticket-add", { project: made.result.project, name: "b", lane: "nothing" })
  expect(refused.ok).toBe(false)
  expect(projects()).toHaveLength(1)
})

test("ticket-update は、レーン・タグ・担当を名前でも指せ、同じワークルームを名前と id で 2 回書くと断る", () => {
  const { user, projects, tickets, store } = ready()
  const addRoom = (name: string) =>
    (
      (store.actions.perform as unknown as (id: string, a: unknown) => Done)("@matomezu/base:workroom-add", {
        name,
        bird: "inko",
      }) as Done & { result: { workroom: string } }
    ).result.workroom
  user("project-add", {})
  const p = projects()[0] as Project
  const room = addRoom("ひよこ")
  const t = (user("ticket-add", { project: p.id, name: "a" }) as Done & { result: { ticket: string } }).result.ticket
  expect(user("ticket-update", { lane: "作業中", tags: ["タスク"], assignees: ["ひよこ"] }, { record: t }).ok).toBe(
    true,
  )
  expect(tickets()[0]).toMatchObject({ lane: p.lanes[1]?.id, assignees: [room] })
  expect(user("ticket-update", { assignees: ["ひよこ", room] }, { record: t }).ok).toBe(false)
  expect(user("ticket-update", { lane: "unsorted" }, { record: t }).ok).toBe(true)
  expect(tickets()[0]).toMatchObject({ lane: "unsorted" })
})

test("ticket-update は、今の値をそのまま送れば通る（消したレーン・有効でなくなったタグ・消したワークルームのままでも。タグは名前でも）。ticket-add は有効でないタグを名前で指すと断る", () => {
  const { user, projects, tickets, store } = ready()
  const perform = store.actions.perform as unknown as (id: string, a: unknown, o?: { record: string }) => Done
  user("project-add", {})
  const p = projects()[0] as Project
  const room = (
    perform("@matomezu/base:workroom-add", { name: "ひよこ", bird: "inko" }) as Done & { result: { workroom: string } }
  ).result.workroom
  const lane = p.lanes[0]?.id as string
  const tag = p.tags[0]?.id as string
  const t = (
    user("ticket-add", { project: p.id, name: "a", lane, tags: [tag], assignees: [room] }) as Done & {
      result: { ticket: string }
    }
  ).result.ticket
  // レーンを消し、タグを使わなくし、ワークルームを消す
  const lanes = p.lanes
    .filter(l => l.kind !== "lane" || l.id !== lane)
    .map(l => (l.kind === "lane" ? { ...l, prompt: "" } : l))
  const tags = p.tags.map((x, i) => ({ ...x, prompt: "", enabled: i !== 0 }))
  expect(user("project-update", { lanes, tags }, { record: p.id }).ok).toBe(true)
  perform("@matomezu/base:workroom-remove", {}, { record: room })
  expect(user("ticket-update", { lane, tags: [tag], assignees: [room], name: "b" }, { record: t }).ok).toBe(true)
  expect(user("ticket-update", { tags: ["タスク"] }, { record: t }).ok).toBe(true)
  expect(tickets()[0]).toMatchObject({ name: "b", lane, tags: [tag], assignees: [room] })
  expect(user("ticket-add", { project: p.id, name: "c", tags: ["タスク"] }).ok).toBe(false)
  // 外すと、使わないタグは付け直せない
  expect(user("ticket-update", { tags: [] }, { record: t }).ok).toBe(true)
  expect(user("ticket-update", { tags: [tag] }, { record: t }).ok).toBe(false)
})
