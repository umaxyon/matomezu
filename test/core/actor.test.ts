// アクター: 利用者か AI か。読む所は isAI・isUser を通し、外から来る "ai" の印は actorOfWire で形にする
import { expect, test } from "bun:test"
import { AI, actorOfWire, isAI, isUser, USER } from "../../web/src/core/actor"

test("利用者と AI は別のアクターで、isAI・isUser が答える", () => {
  expect([isAI(USER), isUser(USER)]).toEqual([false, true])
  expect([isAI(AI), isUser(AI)]).toEqual([true, false])
})

test('外から来た印は、"ai" なら AI、無ければ利用者', () => {
  expect(actorOfWire("ai")).toBe(AI)
  expect(actorOfWire(undefined)).toBe(USER)
})
