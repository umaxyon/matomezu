// アクター: 利用者か AI か。読む所は isAI・isUser を通し、外から来る形は actorOfWire でアクターにする
import { expect, test } from "bun:test"
import { AI, actorOfWire, hasJoined, isAI, isUser, USER } from "../../web/src/core/actor"

test("利用者と AI は別のアクターで、isAI・isUser が答える", () => {
  expect([isAI(USER), isUser(USER)]).toEqual([false, true])
  expect([isAI(AI), isUser(AI)]).toEqual([true, false])
})

test('外から来た印は、"ai" なら AI、無ければ利用者', () => {
  expect(hasJoined(actorOfWire({ kind: "ai", workroom: "w1" }))).toBe(true)
  expect(actorOfWire({ kind: "ai", workroom: "w1" })).toEqual({ kind: "ai", workroom: { id: "w1" } })
  expect(isAI(actorOfWire({ kind: "ai" })) && !hasJoined(actorOfWire({ kind: "ai" }))).toBe(true)
  expect(isUser(actorOfWire(undefined))).toBe(true)
})
