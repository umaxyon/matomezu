// タスクボードの見せ方の決め事（taskboard/board.ts・sort.ts・maximize.ts・ticket-label.ts）と、利用者の設定 2 つ（settings.ts）
import { expect, test } from "bun:test"
import { autoInputOf } from "../../../web/src/plugins/base/settings/user-settings"
import {
  assigneesOf,
  type CurrentRecord,
  currentTaskOf,
  type HistoryRecord,
  lanesOf,
  newestFirst,
  orderedProjects,
  type ProjectRecord,
  shownProjects,
  type TicketRecord,
  tagOf,
  ticketsByLane,
} from "../../../web/src/plugins/taskboard/board"
import { maximizedAmong, released, toggleBoard, toggleLane } from "../../../web/src/plugins/taskboard/maximize"
import { PROJECT_ORDER, SHOWN_PROJECTS } from "../../../web/src/plugins/taskboard/settings"
import { DEFAULT_SORT, type SortRules, sortTickets } from "../../../web/src/plugins/taskboard/sort"
import { ticketLabel } from "../../../web/src/plugins/taskboard/ticket-label"
import { CORE_CATALOG } from "../../support"

const project = (id: string, over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id,
  name: id,
  prefix: "T-",
  closed: false,
  lanes: [
    { kind: "lane", id: "todo", name: "未着手", prompt: "" },
    { kind: "unsorted", shown: false },
    { kind: "lane", id: "done", name: "完了", prompt: "" },
  ],
  tags: [
    { id: "task", name: "タスク", color: "primary", enabled: true, prompt: "" },
    { id: "bug", name: "バグ", color: "danger", enabled: true, prompt: "" },
  ],
  ...over,
})
const ticket = (id: string, over: Partial<TicketRecord> = {}): TicketRecord => ({
  id,
  project: "p1",
  number: Number(id.replace(/\D/g, "")) || 1,
  name: id,
  body: "",
  lane: "todo",
  tag: "none",
  priority: "medium",
  assignees: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  createdBy: { kind: "user" },
  updatedAt: "2026-11-01T00:00:00.000Z",
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
      { kind: "lane", id: "todo", name: "未着手", prompt: "" },
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

test("タグは id で引き、タグなしと無いタグは無い物として読む。担当は、あるワークルームだけを書いた順に", () => {
  const p = project("p1")
  expect(tagOf(p, ticket("T1", { tag: "bug" }))?.name).toBe("バグ")
  expect(tagOf(p, ticket("T1", { tag: "none" }))).toBeUndefined()
  expect(tagOf(p, ticket("T1", { tag: "gone" }))).toBeUndefined()
  expect(assigneesOf(ticket("T1", { assignees: ["r2", "gone", "r1"] }), ["r1", "r2"])).toEqual(["r2", "r1"])
})

test("並べ方は、使う項目を上から比べる。既定は id の降順。タグは設定の並びの順で、タグなしと無いタグは最後。何も使わなければ元の並び", () => {
  const list = [
    ticket("T1", { priority: "low", tag: "bug", updatedAt: "2026-11-03T00:00:00.000Z" }),
    ticket("T2", { priority: "high", tag: "task", updatedAt: "2026-11-01T00:00:00.000Z" }),
    ticket("T3", { priority: "high", tag: "none", updatedAt: "2026-11-02T00:00:00.000Z" }),
  ]
  const ids = (rules: SortRules) => sortTickets(list, rules, ["task", "bug"]).map(t => t.id)
  expect(ids(DEFAULT_SORT)).toEqual(["T3", "T2", "T1"])
  const on = (...keys: [string, boolean][]): SortRules =>
    DEFAULT_SORT.map(r => ({
      ...r,
      on: keys.some(([k]) => k === r.key),
      desc: keys.find(([k]) => k === r.key)?.[1] ?? false,
    }))
  expect(ids(on(["priority", true], ["updated", false]))).toEqual(["T2", "T3", "T1"])
  expect(ids(on(["tag", false]))).toEqual(["T2", "T1", "T3"])
  expect(ids(on())).toEqual(["T1", "T2", "T3"])
})

test("番号の見せ方は、プレフィクスに 3 桁まで 0 で埋めた番号。1000 からはそのまま", () => {
  expect(ticketLabel("T-", 3)).toBe("T-003")
  expect(ticketLabel("BUG-", 42)).toBe("BUG-042")
  expect(ticketLabel("T-", 1000)).toBe("T-1000")
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

test("ワークルームの今のチケットは、宣言が無い・none・チケットかプロジェクトが無ければ無く、あれば最新の履歴を添える", () => {
  const p = project("p1")
  const t = ticket("T1")
  const current = (ticketId: string): CurrentRecord => ({ id: "r1", ticket: ticketId, at: "t" })
  const history = [
    line("h1", "T1", "2026-11-01T00:00:00.000Z"),
    line("h2", "T1", "2026-11-02T00:00:00.000Z"),
    line("h3", "T2", "2026-11-03T00:00:00.000Z"),
  ]
  expect(currentTaskOf("r1", [], [t], [p], history)).toBeUndefined()
  expect(currentTaskOf("r1", [current("none")], [t], [p], history)).toBeUndefined()
  expect(currentTaskOf("r1", [current("gone")], [t], [p], history)).toBeUndefined()
  expect(currentTaskOf("r1", [current("T1")], [t], [], history)).toBeUndefined()
  const found = currentTaskOf("r1", [current("T1")], [t], [p], history)
  expect(found?.ticket.id).toBe("T1")
  expect(found?.latest?.id).toBe("h2")
  expect(newestFirst([line("a", "T1", "x"), line("b", "T1", "x")]).map(h => h.id)).toEqual(["b", "a"])
})

test("利用者の設定 2 つは利用者だけが変え、値の形から入力Formが作れないので、全体設定の並びには出ない", () => {
  expect(PROJECT_ORDER.userOnly).toBe(true)
  expect(SHOWN_PROJECTS.userOnly).toBe(true)
  expect(PROJECT_ORDER.default).toEqual([])
  expect("default" in SHOWN_PROJECTS).toBe(false)
  expect(autoInputOf(CORE_CATALOG, PROJECT_ORDER)).toBeNull()
  expect(autoInputOf(CORE_CATALOG, SHOWN_PROJECTS)).toBeNull()
})
