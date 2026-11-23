// チケットスクリーンが見せる物の整え方: チケット履歴の行（起票の行・新しい順）・日ごとのまとめ・担当（ticket/assignees.ts）

import { expect, test } from "bun:test"
import { assigneesOf } from "../../../web/src/plugins/taskboard/ticket/assignees"
import { viewOf } from "../../../web/src/plugins/taskboard/ticket-screen"
import {
  dayHeading,
  FILED,
  groupByDay,
  historyRows,
  rowTextSource,
  timeOf,
  topicColor,
  topicTail,
  whenOf,
} from "../../../web/src/plugins/taskboard/ticket-screen/view"

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

test("チケット履歴の行は、そのチケットの物に起票の行を足し、新しい順に並べる（同じ時点は id の降順）", () => {
  const rows = historyRows(ticket, [
    line("b", "2026-11-12T01:00:00.000Z"),
    line("a", "2026-11-12T01:00:00.000Z"),
    line("c", "2026-11-11T10:00:00.000Z"),
    line("other", "2026-11-13T00:00:00.000Z", "t2"),
  ])
  expect(rows.map(r => r.id)).toEqual(["b", "a", "c", `${FILED}:t1`])
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

test("題の色は、起票の行が success、そのほかは列挙の値の data。列挙から無くなった題は色を付けず、id の終わりを名前にする", () => {
  expect(topicColor(FILED, undefined)).toBe("success")
  expect(topicColor("a:b", { color: "warn" })).toBe("warn")
  expect(topicColor("a:gone", undefined)).toBeUndefined()
  expect(topicTail("@x/y:topic-review")).toBe("topic-review")
})

test("チケットスクリーンの画面の状態は、開いているチケットが替われば初めの形に戻る", () => {
  const first = viewOf(undefined, "t1")
  expect(first).toEqual({ ticket: "t1", mode: "rendered-only", side: "body", maximized: false })
  const changed = { ...first, maximized: true, question: "q" }
  expect(viewOf(changed, "t1")).toBe(changed)
  expect(viewOf(changed, "t2")).toEqual({ ticket: "t2", mode: "rendered-only", side: "body", maximized: false })
})

test("履歴の行の文の出どころ: 起票・本文更新の行は題から、文を持たない題の文の無い行は題の名前、そのほかは行の文", () => {
  const row = (topic: string, text: string) => ({ id: "r", topic, text, at: "t", by: { kind: "user" } }) as never
  expect(rowTextSource(row(FILED, ""), false)).toBe("filed")
  expect(rowTextSource(row("@matomezu/taskboard:topic-body", ""), true)).toBe("body")
  expect(rowTextSource(row("@x/y:topic-review", ""), true)).toBe("topic")
  expect(rowTextSource(row("@x/y:topic-review", "文"), true)).toBe("text")
  expect(rowTextSource(row("@x/y:topic-review", ""), false)).toBe("text")
})
