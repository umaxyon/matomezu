// タスクボードの見せ方の決め事（taskboard/board の shown.ts・sort.ts・maximize.ts）・今のチケット（ticket/current.ts と、作業の様子の workroomActivity）・チケットの番号と担当（ticket/label.ts・assignees.ts）と、利用者の設定 2 つ（board/user-settings.ts）
import { expect, test } from "bun:test"
import { workroomActivityOf } from "../../../web/src/plugins/base/participant/activity"
import { autoInputOf } from "../../../web/src/plugins/base/settings/user-settings"
import { laneKeyOf, movedLanes } from "../../../web/src/plugins/taskboard/board/lane-order"
import { maximizedAmong, released, toggleBoard, toggleLane } from "../../../web/src/plugins/taskboard/board/maximize"
import {
  cardSizeOf,
  lanesOf,
  orderedProjects,
  type ProjectRecord,
  shownProjects,
  type TicketRecord,
  ticketsByLane,
} from "../../../web/src/plugins/taskboard/board/shown"
import { DEFAULT_SORT, type SortRules, sortTickets } from "../../../web/src/plugins/taskboard/board/sort"
import { PROJECT_ORDER, SHOWN_PROJECTS } from "../../../web/src/plugins/taskboard/board/user-settings"
import { PROJECT } from "../../../web/src/plugins/taskboard/project"
import { TICKET } from "../../../web/src/plugins/taskboard/ticket"
import { assigneesOf } from "../../../web/src/plugins/taskboard/ticket/assignees"
import { currentTicketsOf } from "../../../web/src/plugins/taskboard/ticket/current"
import { ticketLabel } from "../../../web/src/plugins/taskboard/ticket/label"
import { tagsOf } from "../../../web/src/plugins/taskboard/ticket/tags"
import { type HistoryRecord, newestFirst } from "../../../web/src/plugins/taskboard/ticket-history"
import { CORE_CATALOG } from "../../support"

const project = (id: string, over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id,
  name: id,
  prefix: "T-",
  closed: false,
  lanes: [
    { kind: "lane", id: "todo", name: "未着手", prompt: "", cardSize: "inherit" },
    { kind: "unsorted", shown: false },
    { kind: "lane", id: "done", name: "完了", prompt: "", cardSize: "inherit" },
  ],
  tags: [
    { id: "task", name: "タスク", color: "primary", enabled: true, prompt: "" },
    { id: "bug", name: "バグ", color: "danger", enabled: true, prompt: "" },
  ],
  doneLane: "done",
  cardSize: "medium",
  cardShows: { priority: true },
  ...over,
})
const ticket = (id: string, over: Partial<TicketRecord> = {}): TicketRecord => ({
  id,
  project: "p1",
  number: Number(id.replace(/\D/g, "")) || 1,
  name: id,
  body: "",
  lane: "todo",
  priority: "medium",
  assignees: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  createdBy: { kind: "user" },
  updatedAt: "2026-11-01T00:00:00.000Z",
  tags: [],
  ...over,
})
const line = (id: string, ticketId: string, at: string): HistoryRecord => ({
  id,
  ticket: ticketId,
  topic: "@matomezu/taskboard:topic-status",
  text: id,
  at,
  by: { kind: "user" },
})

test("一覧は、利用者の並びにある物をその順に、並びに無い物は後ろに名前の順。閉じたプロジェクトは出さない", () => {
  const all = [project("b"), project("a"), project("c"), project("z", { closed: true })]
  expect(orderedProjects(all, ["c", "z", "gone", "b"]).map(p => p.id)).toEqual(["c", "b", "a"])
  expect(orderedProjects(all, []).map(p => p.id)).toEqual(["a", "b", "c"])
})

test("出しているタスクボードは、設定の値が無ければ並びの最初の 1 枚、空の並びなら何も出さず、あれば並びの順で、並びに無い物は出さない", () => {
  const ordered = [project("c"), project("b"), project("a")]
  expect(shownProjects(ordered, undefined).map(p => p.id)).toEqual(["c"])
  expect(shownProjects(ordered, []).map(p => p.id)).toEqual([])
  expect(shownProjects(ordered, ["a", "c", "gone"]).map(p => p.id)).toEqual(["c", "a"])
})

test("タスクボードのレーンは設定の並びのとおりで、未分類は「未分類を表示する」がオンのときだけ出る", () => {
  expect(lanesOf(project("p1")).map(l => l.id)).toEqual(["todo", "done"])
  const withUnsorted = project("p1", {
    lanes: [
      { kind: "lane", id: "todo", name: "未着手", prompt: "", cardSize: "inherit" },
      { kind: "unsorted", shown: true },
    ],
  })
  expect(lanesOf(withUnsorted)).toEqual([
    { id: "todo", name: "未着手" },
    { id: "unsorted", name: null },
  ])
})

test("チケットはレーンごとに分け、無いレーンのチケットは未分類に入る。ほかのプロジェクトのチケットは入らない", () => {
  const p = project("p1")
  const by = ticketsByLane(
    [ticket("T1"), ticket("T2", { lane: "done" }), ticket("T3", { lane: "gone" }), ticket("T4", { project: "p2" })],
    p,
  )
  expect(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.map(t => t.id)]))).toEqual({
    todo: ["T1"],
    done: ["T2"],
    unsorted: ["T3"],
  })
})

test("タグは id で引き、無いタグは外して、プロジェクトのタグの順に並べる。担当は、あるワークルームだけを書いた順に", () => {
  const p = project("p1")
  expect(tagsOf(p, ticket("T1", { tags: ["bug", "gone", "task"] })).map(t => t.name)).toEqual(["タスク", "バグ"])
  expect(tagsOf(p, ticket("T1", { tags: [] }))).toEqual([])
  expect(
    assigneesOf(ticket("T1", { assignees: ["r2", "gone", "r1"] }), [{ id: "r1" }, { id: "r2" }]).map(w => w.id),
  ).toEqual(["r2", "r1"])
})

test("並べ方は、使う項目を上から比べる。既定は id の降順。タグは設定の並びの順で、付いたタグを 1 つ目から比べ（前が同じなら短い方が先）、タグなしと無いタグだけは最後。何も使わなければ元の並び", () => {
  const list = [
    ticket("T1", { priority: "low", tags: ["bug"], updatedAt: "2026-11-03T00:00:00.000Z" }),
    ticket("T2", { priority: "high", tags: ["task"], updatedAt: "2026-11-01T00:00:00.000Z" }),
    ticket("T3", { priority: "high", tags: ["gone"], updatedAt: "2026-11-02T00:00:00.000Z" }),
    ticket("T4", { priority: "medium", tags: ["bug", "task"], updatedAt: "2026-11-01T00:00:00.000Z" }),
  ]
  const ids = (rules: SortRules) => sortTickets(list, rules, ["task", "bug"]).map(t => t.id)
  expect(ids(DEFAULT_SORT)).toEqual(["T4", "T3", "T2", "T1"])
  const on = (...keys: [string, boolean][]): SortRules =>
    DEFAULT_SORT.map(r => ({
      ...r,
      on: keys.some(([k]) => k === r.key),
      desc: keys.find(([k]) => k === r.key)?.[1] ?? false,
    }))
  expect(ids(on(["priority", true], ["updated", false]))).toEqual(["T2", "T3", "T4", "T1"])
  // T4 はタスクとバグ（プロジェクトの順に 0・1）、T2 はタスク（0）だけ、T1 はバグ（1）
  expect(ids(on(["tag", false]))).toEqual(["T2", "T4", "T1", "T3"])
  expect(ids(on())).toEqual(["T1", "T2", "T3", "T4"])
})

test("番号の見せ方は、プレフィクスに 4 桁まで 0 で埋めた番号。10000 からはそのまま", () => {
  expect(ticketLabel("T-", 3)).toBe("T-0003")
  expect(ticketLabel("BUG-", 42)).toBe("BUG-0042")
  expect(ticketLabel("T-", 1000)).toBe("T-1000")
  expect(ticketLabel("T-", 10000)).toBe("T-10000")
})

test("タスクボードの最大化は 1 つだけ。レーンを最大化するとタスクボードも最大化し、元に戻すと前のタスクボードの最大化に戻る。出ていくタスクボードの最大化は解く", () => {
  expect(toggleBoard(undefined, "a")).toEqual({ board: "a" })
  expect(toggleBoard({ board: "a" }, "a")).toBeUndefined()
  expect(toggleBoard({ board: "a" }, "b")).toEqual({ board: "b" })
  expect(toggleBoard({ board: "a", lane: "x", boardWasMax: true }, "a")).toBeUndefined()
  // タスクボードを最大化していて、そのレーンを最大化・戻す → タスクボードの最大化に戻る
  const lane = toggleLane({ board: "a" }, "a", "x")
  expect(lane).toEqual({ board: "a", lane: "x", boardWasMax: true })
  expect(toggleLane(lane, "a", "x")).toEqual({ board: "a" })
  // 何も最大化していなくて、レーンを最大化・戻す → 何も最大化しない
  const alone = toggleLane(undefined, "a", "x")
  expect(alone).toEqual({ board: "a", lane: "x", boardWasMax: false })
  expect(toggleLane(alone, "a", "x")).toBeUndefined()
  expect(toggleLane({ board: "a", lane: "x", boardWasMax: false }, "a", "y")).toMatchObject({ lane: "y" })
  expect(released({ board: "a" }, "a")).toBeUndefined()
  expect(released({ board: "a" }, "b")).toEqual({ board: "a" })
  expect(maximizedAmong({ board: "a" }, ["a", "b"])).toEqual({ board: "a" })
  expect(maximizedAmong({ board: "a" }, ["b"])).toBeUndefined()
})

test("ワークルームの今のチケットは、主担当で作業中の印のあるレーンにあるチケット。更新の新しい順、同じなら番号の順", () => {
  const working = project("p1", {
    lanes: [
      { kind: "lane", id: "todo", name: "未着手", prompt: "", cardSize: "inherit" },
      { kind: "lane", id: "doing", name: "作業中", prompt: "", cardSize: "inherit", working: true },
      { kind: "lane", id: "review", name: "レビュー", prompt: "", cardSize: "inherit", working: true },
      { kind: "unsorted", shown: false },
      { kind: "lane", id: "done", name: "完了", prompt: "", cardSize: "inherit" },
    ],
    doneLane: "done",
  })
  const closed = project("p2", { ...working, id: "p2", closed: true })
  const projects = new Map([working, closed].map(p => [p.id, p]))
  const of = (tickets: TicketRecord[]) => currentTicketsOf("r1", tickets, id => projects.get(id)).map(c => c.ticket.id)
  const at = (h: number) => `2026-11-01T0${h}:00:00.000Z`
  // 主担当でない・作業中でないレーン・未分類・プロジェクトが無いチケットは入らない
  expect(of([ticket("T1", { lane: "doing", assignees: ["r2", "r1"] })])).toEqual([])
  expect(of([ticket("T1", { lane: "todo", assignees: ["r1"] })])).toEqual([])
  expect(of([ticket("T1", { lane: "unsorted", assignees: ["r1"] })])).toEqual([])
  expect(of([ticket("T1", { lane: "doing", assignees: ["r1"], project: "gone" })])).toEqual([])
  // 作業中の印のレーンはいくつでも。閉じたプロジェクトのチケットも数える
  expect(
    of([
      ticket("T1", { lane: "doing", assignees: ["r1"], updatedAt: at(1) }),
      ticket("T3", { lane: "review", assignees: ["r1"], updatedAt: at(2) }),
      ticket("T2", { lane: "doing", assignees: ["r1"], updatedAt: at(2) }),
      ticket("T4", { lane: "doing", assignees: ["r1"], project: "p2", updatedAt: at(0) }),
    ]),
  ).toEqual(["T2", "T3", "T1", "T4"])
  expect(newestFirst([line("a", "T1", "x"), line("b", "T1", "x")]).map(h => h.id)).toEqual(["b", "a"])
})

test("完了のレーンに作業中の印は付けられない（プロジェクトの形が断る）", () => {
  const p = project("p1", {
    lanes: [
      { kind: "lane", id: "done", name: "完了", prompt: "", cardSize: "inherit", working: true },
      { kind: "unsorted", shown: false },
    ],
  })
  const { doneLane: _done, ...noDone } = p
  expect(PROJECT.record.safeParse(noDone).success).toBe(true)
  expect(PROJECT.record.safeParse(p).success).toBe(false)
})

test("利用者の設定 2 つは利用者だけが変え、値の形から入力Formが作れないので、全体設定の並びには出ない", () => {
  expect(PROJECT_ORDER.userOnly).toBe(true)
  expect(SHOWN_PROJECTS.userOnly).toBe(true)
  expect(PROJECT_ORDER.default).toEqual([])
  expect("default" in SHOWN_PROJECTS).toBe(false)
  expect(autoInputOf(CORE_CATALOG, PROJECT_ORDER)).toBeNull()
  expect(autoInputOf(CORE_CATALOG, SHOWN_PROJECTS)).toBeNull()
})

test("レーンのドラッグによる並べ替えは、未分類の行も含む並びで、ドラッグしたレーンを離したレーンの位置へ移す", () => {
  const lane = (id: string) => ({ kind: "lane" as const, id, name: id, prompt: "", cardSize: "inherit" as const })
  const rows: ProjectRecord["lanes"] = [lane("a"), lane("b"), { kind: "unsorted" as const, shown: true }, lane("c")]
  const keys = (list: typeof rows) => list.map(laneKeyOf)
  expect(keys(movedLanes(rows, "c", "a"))).toEqual(["c", "a", "b", "unsorted"])
  expect(keys(movedLanes(rows, "a", "unsorted"))).toEqual(["b", "unsorted", "a", "c"])
  expect(keys(movedLanes(rows, "b", "b"))).toEqual(["a", "b", "unsorted", "c"])
  expect(keys(movedLanes(rows, "gone", "a"))).toEqual(["a", "b", "unsorted", "c"])
})

test("レーンのチケットカードの大きさは、レーンの cardSize。inherit・未分類・無いレーンなら、プロジェクトの cardSize", () => {
  const p = project("p", {
    cardSize: "large",
    lanes: [
      { kind: "lane", id: "todo", name: "未着手", prompt: "", cardSize: "inherit" },
      { kind: "unsorted", shown: true },
      { kind: "lane", id: "done", name: "完了", prompt: "", cardSize: "small" },
    ],
  })
  expect(cardSizeOf(p, "todo")).toBe("large")
  expect(cardSizeOf(p, "done")).toBe("small")
  expect(cardSizeOf(p, "unsorted")).toBe("large")
  expect(cardSizeOf(p, "gone")).toBe("large")
})

test("ワークルームの作業の様子は、主担当で作業中のレーンにあるチケットがあれば作業中、無ければ空き。行の下の 1 行と同じ判定", () => {
  const p = project("p1", {
    lanes: [
      { kind: "lane", id: "todo", name: "未着手", prompt: "", cardSize: "inherit" },
      { kind: "lane", id: "doing", name: "作業中", prompt: "", cardSize: "inherit", working: true },
      { kind: "unsorted", shown: false },
    ],
  })
  const records = (t?: Partial<TicketRecord>): Record<string, Record<string, unknown>> => ({
    [TICKET.id]: t ? { t1: ticket("t1", t) } : {},
    [PROJECT.id]: { p1: p },
  })
  const activity = (r: ReturnType<typeof records>) => workroomActivityOf(CORE_CATALOG, r, "w")
  expect(activity(records({ lane: "doing", assignees: ["w"] }))).toBe("working")
  expect(activity(records())).toBe("idle")
  expect(activity(records({ lane: "todo", assignees: ["w"] }))).toBe("idle")
  expect(activity(records({ lane: "doing", assignees: ["x", "w"] }))).toBe("idle")
})

test("作業の様子を答える種類が無ければ unknown", () => {
  expect(workroomActivityOf({ ...CORE_CATALOG, subjects: new Map() }, {}, "w")).toBe("unknown")
})
