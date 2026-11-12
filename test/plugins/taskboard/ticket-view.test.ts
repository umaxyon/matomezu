// チケットスクリーンが見せる物の整え方: 番号・履歴の行（起票の行・新しい順）・日ごとのまとめ・担当

import { expect, test } from "bun:test"
import {
  assigneesOf,
  dayHeading,
  FILED,
  groupByDay,
  historyRows,
  ticketLabel,
  timeOf,
  whenOf,
} from "../../../web/src/plugins/taskboard/ticket-view"

const ticket = {
  id: "t1",
  project: "p",
  number: 3,
  name: "n",
  body: "",
  lane: "unsorted",
  tag: "none",
  priority: "medium",
  assignees: ["gone", "b", "a"],
  createdAt: "2026-11-11T09:05:00.000Z",
  createdBy: { kind: "user" },
  updatedAt: "2026-11-11T09:05:00.000Z",
} as never
const line = (id: string, at: string, ticket = "t1") =>
  ({ id, ticket, topic: "x", text: id, at, by: { kind: "user" } }) as never

test("番号は、プレフィクスと 3 桁に 0 を詰めた番号で、1000 からは伸びる", () => {
  expect(ticketLabel("T-", 3)).toBe("T-003")
  expect(ticketLabel("T-", 1000)).toBe("T-1000")
})

test("履歴の行は、そのチケットの物に起票の行を足し、新しい順に並べる（同じ時点は id の順）", () => {
  const rows = historyRows(ticket, [
    line("b", "2026-11-12T01:00:00.000Z"),
    line("a", "2026-11-12T01:00:00.000Z"),
    line("c", "2026-11-11T10:00:00.000Z"),
    line("other", "2026-11-13T00:00:00.000Z", "t2"),
  ])
  expect(rows.map(r => r.id)).toEqual(["a", "b", "c", `${FILED}:t1`])
  expect(rows[3]).toMatchObject({ topic: FILED, by: { kind: "user" }, at: "2026-11-11T09:05:00.000Z" })
})

test("日ごとにまとめる。日の区切りは時間帯で変わる", () => {
  const rows = historyRows(ticket, [line("a", "2026-11-11T20:00:00.000Z")])
  expect(groupByDay(rows, "UTC").map(d => [d.day, d.items.length])).toEqual([["2026-11-11", 2]])
  // 東京では 20:00Z は翌日の朝 5 時
  expect(groupByDay(rows, "Asia/Tokyo").map(d => [d.day, d.items.length])).toEqual([
    ["2026-11-12", 1],
    ["2026-11-11", 1],
  ])
  expect(timeOf("2026-11-11T20:00:00.000Z", "Asia/Tokyo")).toBe("05:00")
  expect(whenOf("2026-11-11T20:00:00.000Z", "Asia/Tokyo")).toBe("2026/11/12 05:00")
  expect(dayHeading("2026-11-12", "ja")).toContain("11")
})

test("担当は、チケットの並びのまま、もう無いワークルームを外す", () => {
  const rooms = [{ id: "a" }, { id: "b" }]
  expect(assigneesOf(ticket, rooms).map(w => w.id)).toEqual(["b", "a"])
})
