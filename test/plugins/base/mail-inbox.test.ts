// 受信トレイの計算（base/mail/inbox.ts）: タブごとの行は新しい順、未読の数は送り手ごとか合計、↑↓は端で止まる

import { expect, test } from "bun:test"
import { NO_STATE } from "../../../web/src/core/def/plugin-state"
import { inboxOf, pickMoved, unreadOf } from "../../../web/src/plugins/base/mail/inbox"
import type { Mail } from "../../../web/src/plugins/base/mail/mail"

const mail = (id: string, senderKind: Mail["senderKind"], seen = false): Mail => ({
  id,
  mail: "@matomezu/base:letter",
  from: "a",
  sentAt: "t",
  props: {},
  order: 1,
  senderKind,
  ...(seen ? { seenAt: "t" } : {}),
})

const box = [mail("a1", "ai", true), mail("u1", "user"), mail("a2", "ai"), mail("a3", "ai")]

test("タブの行は送り手の種類で分け、新しい順。未読の数は送り手ごとか合計", () => {
  expect(inboxOf(box, "ai").map(m => m.id)).toEqual(["a3", "a2", "a1"])
  expect(inboxOf(box, "user").map(m => m.id)).toEqual(["u1"])
  expect([unreadOf(box, "all"), unreadOf(box, "ai"), unreadOf(box, "user")]).toEqual([3, 2, 1])
})

test("↑↓: 選んでいなければ下で先頭・上で末尾、端では動かない、行が無ければ選ばない", () => {
  const rows = inboxOf(box, "ai")
  expect(pickMoved(rows, NO_STATE, "down")).toBe("a3")
  expect(pickMoved(rows, NO_STATE, "up")).toBe("a1")
  expect(pickMoved(rows, "a3", "down")).toBe("a2")
  expect(pickMoved(rows, "a3", "up")).toBe("a3")
  expect(pickMoved(rows, "a1", "down")).toBe("a1")
  expect(pickMoved([], NO_STATE, "down")).toBe(NO_STATE)
  // 並びに無い郵便（ほかのタブ・消えた物）は、選んでいないのと同じ
  expect(pickMoved(rows, "u1", "down")).toBe("a3")
})
