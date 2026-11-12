// 参加者の表のアクションの結果の確かめ（core/participant.ts の participantsSettle）: 新しく入った・変わった参加者は、形に合い

import { expect, test } from "bun:test"
import {
  type Participant,
  type Participants,
  participantsSettle,
  restoreParticipants,
} from "../../web/src/core/participant"

const person = (over: Partial<Participant> = {}): Participant => ({
  id: "p1",
  state: "requested",
  ai: "claude",
  model: "m",
  env: "e",
  sessionName: "",
  link: "l1",
  requestedAt: "2026-11-09T00:00:00Z",
  ...over,
})

test("足した・変えた参加者が形に合えば通り、合わなければ断る（前からあって変えていない物は見ない）", () => {
  const old = person()
  expect(participantsSettle([], [old])).toBe(true)
  expect(participantsSettle([old], [old, person({ id: "p2", link: "l2" })])).toBe(true)
  expect(participantsSettle([], [person({ link: "" })])).toBe(false)
  expect(participantsSettle([], [person({ state: "gone" as Participant["state"] })])).toBe(false)
  // 前からある物は、形が合わなくなっていても変えなければ断らない
  const broken = person({ link: "" })
  expect(participantsSettle([broken], [broken, person({ id: "p2", link: "l2" })])).toBe(true)
})

test("残しておいた表は、並びならそのまま、並びでなければ空", () => {
  const list: Participants = [person()]
  expect(restoreParticipants(list)).toBe(list)
  expect(restoreParticipants(null)).toEqual([])
  expect(restoreParticipants({ a: 1 })).toEqual([])
})

test("id が重なる参加者の表は断る", () => {
  const old = person()
  expect(participantsSettle([old], [old, person({ link: "l2" })])).toBe(false)
})
