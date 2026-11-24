// 受信トレイの計算（base/mail/inbox.ts）: タブごとの行は新しい順、未読の数は送り手ごとか合計、↑↓は端で止まる

import { expect, test } from "bun:test"
import { NO_STATE } from "../../../web/src/core/def/plugin-state"
import { FIRST_SHOWN, inboxFrom, inboxOf, pickMoved, unreadOf } from "../../../web/src/plugins/base/mail/inbox"
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

const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}` }))

test("受信トレイの範囲: 最初は 1 つ目の範囲。利用者が選んだ範囲を、行が増えても保つ。行が減って範囲が空になれば最後の範囲", () => {
  expect(inboxFrom(rowsOf(130), NO_STATE, FIRST_SHOWN)).toBe(0)
  expect(inboxFrom(rowsOf(130), NO_STATE, { from: 60, anchor: NO_STATE })).toBe(60)
  expect(inboxFrom(rowsOf(131), NO_STATE, { from: 60, anchor: NO_STATE })).toBe(60)
  expect(inboxFrom(rowsOf(50), NO_STATE, { from: 60, anchor: NO_STATE })).toBe(30)
  expect(inboxFrom(rowsOf(0), NO_STATE, { from: 60, anchor: NO_STATE })).toBe(0)
})

test("受信トレイの範囲: 範囲を選んだあとに外から選ばれた郵便（しおり・行の移動）が範囲の外なら、その郵便を含む範囲。範囲を選んだときに選んでいた郵便なら、範囲を保つ", () => {
  expect(inboxFrom(rowsOf(130), "m75", FIRST_SHOWN)).toBe(60)
  expect(inboxFrom(rowsOf(130), "m29", { from: 0, anchor: NO_STATE })).toBe(0)
  expect(inboxFrom(rowsOf(130), "m30", { from: 0, anchor: NO_STATE })).toBe(30)
  // m3 を選んだまま 3 つ目の範囲へ送った: 範囲を保つ
  expect(inboxFrom(rowsOf(130), "m3", { from: 60, anchor: "m3" })).toBe(60)
  // 今の範囲の中の郵便を選んだ: 範囲を保つ
  expect(inboxFrom(rowsOf(130), "m70", { from: 60, anchor: "m3" })).toBe(60)
  // 消えた郵便を選んでいる: 選んでいないのと同じ
  expect(inboxFrom(rowsOf(130), "gone", { from: 90, anchor: NO_STATE })).toBe(90)
})
