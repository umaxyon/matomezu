// 横断検索のチケットの絞り（taskboard/wide-search/filter.ts）: 横断検索の当たりのチケットの id の集合と、プロジェクト・タグ・優先度の選びの掛け合わせ
import { expect, test } from "bun:test"
import type { Ticket } from "../../../web/src/plugins/taskboard/ticket"
import { ticketNumberOf } from "../../../web/src/plugins/taskboard/ticket/label"
import {
  filterTickets,
  isFiltering,
  isInitialChoice,
  NO_FILTER,
  NO_TAGS,
  searchTerms,
  ticketIdsOf,
  toggled,
} from "../../../web/src/plugins/taskboard/wide-search/filter"

const TICKET = "@matomezu/taskboard:ticket"
const HISTORY = "@matomezu/taskboard:ticket-history"
const ticket = (id: string, over: Partial<Ticket> = {}): Ticket => ({
  id,
  project: "p1",
  number: 1,
  name: id,
  body: "",
  lane: "todo",
  tags: [],
  priority: "medium",
  volume: "none",
  assignees: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: { kind: "user" },
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
})
const all = [
  ticket("a"),
  ticket("b", { tags: ["bug"], priority: "high" }),
  ticket("c", { project: "p2", tags: ["bug"], volume: "m" }),
  ticket("d", { project: "p2", priority: "high", volume: "xl" }),
]
const ids = (f: Parameters<typeof filterTickets>[1]) => filterTickets(all, f).map(t => t.id)

test("当たりは、チケットの当たりは自分の id、履歴の当たりは親のチケットの id になり、重ならない", () => {
  const hit = (kind: string, id: string, of?: { kind: string; id: string }) => ({
    kind,
    id,
    part: "body",
    brief: "",
    snippet: "",
    ...(of ? { of } : {}),
  })
  expect(
    ticketIdsOf(
      [
        hit(TICKET, "a"),
        hit(HISTORY, "h1", { kind: TICKET, id: "b" }),
        hit(HISTORY, "h2", { kind: TICKET, id: "a" }),
        hit(HISTORY, "h3"),
      ],
      TICKET,
    ),
  ).toEqual(["a", "b"])
})

test("絞りが無いか効いていなければ全部、言葉の当たりとプロジェクト・タグ・優先度・チケットボリュームの選びは掛け合わせて残す", () => {
  expect(ids(undefined)).toEqual(["a", "b", "c", "d"])
  expect(isFiltering(NO_FILTER)).toBe(false)
  expect(ids(NO_FILTER)).toEqual(["a", "b", "c", "d"])
  expect(ids({ ...NO_FILTER, term: "x", hits: ["a", "c"] })).toEqual(["a", "c"])
  expect(ids({ ...NO_FILTER, hits: [] })).toEqual([])
  expect(ids({ ...NO_FILTER, projects: ["p2"] })).toEqual(["c", "d"])
  expect(ids({ ...NO_FILTER, tags: ["bug"] })).toEqual(["b", "c"])
  expect(ids({ ...NO_FILTER, tags: [NO_TAGS] })).toEqual(["a", "d"])
  expect(ids({ ...NO_FILTER, tags: [NO_TAGS, "bug"] })).toEqual(["a", "b", "c", "d"])
  expect(filterTickets([ticket("e", { tags: ["x", "bug"] })], { ...NO_FILTER, tags: ["bug"] })).toHaveLength(1)
  expect(ids({ ...NO_FILTER, priorities: ["high"] })).toEqual(["b", "d"])
  expect(ids({ ...NO_FILTER, projects: ["p2"], tags: ["bug"], priorities: ["medium"], hits: ["c", "d"] })).toEqual([
    "c",
  ])
  expect(ids({ ...NO_FILTER, projects: ["p1", "p2"], priorities: ["high", "medium"] })).toEqual(["a", "b", "c", "d"])
  expect(isFiltering({ ...NO_FILTER, volumes: ["none"] })).toBe(true)
  expect(ids({ ...NO_FILTER, volumes: ["none"] })).toEqual(["a", "b"])
  expect(ids({ ...NO_FILTER, volumes: ["m", "xl"], priorities: ["high"] })).toEqual(["d"])
})

test("選びは、押すと入り、もう一度押すと外れる", () => {
  expect(toggled([], "a")).toEqual(["a"])
  expect(toggled(["a", "b"], "a")).toEqual(["b"])
})

test("数字で終わる語（プレフィクスに数字が続く形も、数字だけも）は、先頭の 0 を除いた数字も一緒に探し、元の語は残す", () => {
  expect(ticketNumberOf("M-0050")).toBe("50")
  expect(ticketNumberOf("T-0012")).toBe("12")
  expect(ticketNumberOf("M-10000")).toBe("10000")
  expect(ticketNumberOf("login")).toBeUndefined()
  expect(ticketNumberOf("2026")).toBe("2026")
  expect(ticketNumberOf("0164")).toBe("164")
  expect(ticketNumberOf("M-0000")).toBeUndefined()
  expect(searchTerms("M-0050 login")).toEqual(["M-0050", "login", "50"])
  expect(searchTerms("  ログイン  ")).toEqual(["ログイン"])
  expect(searchTerms("0164")).toEqual(["0164", "164"])
  expect(searchTerms("164")).toEqual(["164"])
  expect(searchTerms("T-0012 T-0012")).toEqual(["T-0012", "12"])
})

test("選びの初めの状態は、出しているプロジェクトだけを選び、ほかは選ばない形", () => {
  expect(isInitialChoice({ ...NO_FILTER, projects: ["p2", "p1"] }, ["p1", "p2"])).toBe(true)
  expect(isInitialChoice({ ...NO_FILTER, projects: ["p1"] }, ["p1", "p2"])).toBe(false)
  expect(isInitialChoice({ ...NO_FILTER, projects: ["p1", "p3"] }, ["p1", "p2"])).toBe(false)
  expect(isInitialChoice({ ...NO_FILTER, projects: ["p1"], tags: [NO_TAGS] }, ["p1"])).toBe(false)
  expect(isInitialChoice({ ...NO_FILTER, projects: ["p1"], priorities: ["high"] }, ["p1"])).toBe(false)
  expect(isInitialChoice({ ...NO_FILTER, projects: ["p1"], volumes: ["m"] }, ["p1"])).toBe(false)
})
