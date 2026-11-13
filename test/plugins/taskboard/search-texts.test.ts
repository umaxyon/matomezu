// 言葉で探すための文字: チケットは番号と名前が題・本文が本文、履歴の行は文が本文

import { expect, test } from "bun:test"
import { TICKET } from "../../../web/src/plugins/taskboard/ticket"
import { HISTORY } from "../../../web/src/plugins/taskboard/ticket-history"

test("a ticket's title is its number and name, and its body is the body", () => {
  const ticket = TICKET.record.parse({
    id: "t1",
    project: "p1",
    number: 12,
    name: "ログイン画面",
    body: "パスワードの確認",
    lane: "todo",
    tags: [],
    priority: "medium",
    assignees: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: { kind: "user" },
    updatedAt: "2026-01-01T00:00:00.000Z",
  })
  expect(TICKET.searchTexts?.(ticket)).toEqual({ title: "12 ログイン画面", body: "パスワードの確認" })
})

test("a history line has only its text as the body", () => {
  const line = HISTORY.record.parse({
    id: "h1",
    ticket: "t1",
    topic: "topic-status",
    text: "確認が済んだ",
    at: "2026-01-01T00:00:00.000Z",
    by: { kind: "user" },
  })
  expect(HISTORY.searchTexts?.(line)).toEqual({ body: "確認が済んだ" })
})
