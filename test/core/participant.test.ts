// 参加者の表のアクションの結果の確かめ（core/participant.ts の participantsSettle）: 新しく入った・変わった参加者は、形に合い、プロジェクトが表にある物だけ

import { expect, test } from "bun:test"
import {
  type Participant,
  type Participants,
  participantsSettle,
  restoreParticipants,
} from "../../web/src/core/participant"
import { DEFAULT_PROJECT } from "../../web/src/core/project"

const person = (over: Partial<Participant> = {}): Participant => ({
  id: "p1",
  state: "requested",
  ai: "claude",
  model: "m",
  env: "e",
  sessionName: "",
  link: "l1",
  projects: [DEFAULT_PROJECT],
  requestedAt: "2026-11-09T00:00:00Z",
  ...over,
})

test("足した・変えた参加者が形に合えば通り、合わなければ断る（前からあって変えていない物は見ない）", () => {
  const old = person()
  expect(participantsSettle([], [old])).toBe(true)
  expect(participantsSettle([old], [old, person({ id: "p2", link: "l2" })])).toBe(true)
  expect(participantsSettle([], [person({ link: "" })])).toBe(false)
  expect(participantsSettle([], [person({ state: "gone" as Participant["state"] })])).toBe(false)
  expect(participantsSettle([], [person({ projects: [] })])).toBe(false)
  // 前からある物は、形が合わなくなっていても変えなければ断らない
  const broken = person({ link: "" })
  expect(participantsSettle([broken], [broken, person({ id: "p2", link: "l2" })])).toBe(true)
})

test("プロジェクトの表に無いプロジェクトに入る参加者は断る", () => {
  expect(participantsSettle([], [person({ projects: ["nope"] })])).toBe(false)
  expect(participantsSettle([], [person({ projects: [DEFAULT_PROJECT, "nope"] })])).toBe(false)
})

test("残しておいた表は、並びならそのまま、並びでなければ空", () => {
  const list: Participants = [person()]
  expect(restoreParticipants(list)).toBe(list)
  expect(restoreParticipants(null)).toEqual([])
  expect(restoreParticipants({ a: 1 })).toEqual([])
})
